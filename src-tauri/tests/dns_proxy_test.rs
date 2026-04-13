use colima_desktop_lib::proxy::dns::DnsServer;
use std::net::Ipv4Addr;

#[tokio::test]
async fn test_dns_server() {
    // 1. Start DNS server on port 15553
    let dns = DnsServer::new(15553);
    let dns_table = dns.table();
    let dns_shutdown = dns.shutdown_handle();

    {
        let mut table = dns_table.lock().await;
        table.insert("dd-auth.colima.local".to_string(), Ipv4Addr::LOCALHOST);
        table.insert("echo.colima.local".to_string(), Ipv4Addr::new(172, 17, 0, 5));
    }

    tokio::spawn(async move {
        let _ = dns.run().await;
    });

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // 2. Test DNS resolution
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.unwrap();

    // Query dd-auth.colima.local → should return 127.0.0.1
    let query = build_dns_query("dd-auth.colima.local");
    socket.send_to(&query, "127.0.0.1:15553").await.unwrap();

    let mut buf = [0u8; 512];
    let (len, _) = socket.recv_from(&mut buf).await.unwrap();
    let response = &buf[..len];

    let ancount = u16::from_be_bytes([response[6], response[7]]);
    assert!(ancount > 0, "DNS should return an answer");
    let ip_bytes = &response[len - 4..len];
    assert_eq!(ip_bytes, &[127, 0, 0, 1]);
    println!("DNS: dd-auth.colima.local → 127.0.0.1 ✓");

    // Query echo.colima.local → should return 172.17.0.5
    let query2 = build_dns_query("echo.colima.local");
    socket.send_to(&query2, "127.0.0.1:15553").await.unwrap();
    let (len2, _) = socket.recv_from(&mut buf).await.unwrap();
    let ip_bytes2 = &buf[len2 - 4..len2];
    assert_eq!(ip_bytes2, &[172, 17, 0, 5]);
    println!("DNS: echo.colima.local → 172.17.0.5 ✓");

    // Query unknown.colima.local → NXDOMAIN
    let query3 = build_dns_query("unknown.colima.local");
    socket.send_to(&query3, "127.0.0.1:15553").await.unwrap();
    let (_len3, _) = socket.recv_from(&mut buf).await.unwrap();
    let rcode = buf[3] & 0x0F;
    assert_eq!(rcode, 3, "Unknown host should return NXDOMAIN");
    println!("DNS: unknown.colima.local → NXDOMAIN ✓");

    dns_shutdown.notify_one();
}

fn build_dns_query(name: &str) -> Vec<u8> {
    let mut packet = Vec::new();
    packet.extend_from_slice(&[0xAA, 0xBB]);
    packet.extend_from_slice(&[0x01, 0x00]);
    packet.extend_from_slice(&[0x00, 0x01]);
    packet.extend_from_slice(&[0x00, 0x00]);
    packet.extend_from_slice(&[0x00, 0x00]);
    packet.extend_from_slice(&[0x00, 0x00]);
    for label in name.split('.') {
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0x00);
    packet.extend_from_slice(&[0x00, 0x01]);
    packet.extend_from_slice(&[0x00, 0x01]);
    packet
}
