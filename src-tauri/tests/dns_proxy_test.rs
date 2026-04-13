use colima_desktop_lib::proxy::dns::DnsServer;
use colima_desktop_lib::proxy::server::ProxyServer;
use std::net::Ipv4Addr;

#[tokio::test]
async fn test_dns_and_proxy_end_to_end() {
    // 1. Start DNS server on port 15553
    let dns = DnsServer::new(15553);
    let dns_table = dns.table();
    let dns_shutdown = dns.shutdown_handle();

    {
        let mut table = dns_table.lock().await;
        table.insert("dd-auth.colima.local".to_string(), Ipv4Addr::LOCALHOST);
        table.insert("echo.colima.local".to_string(), Ipv4Addr::LOCALHOST);
    }

    tokio::spawn(async move {
        let _ = dns.run().await;
    });

    // 2. Start proxy on port 17080 (test port, not 80)
    let proxy = ProxyServer::new(17080);
    let routes = proxy.routes();
    let proxy_shutdown = proxy.shutdown_handle();

    {
        let mut table = routes.lock().await;
        table.insert("dd-auth.colima.local".to_string(), 3001);
        table.insert("echo.colima.local".to_string(), 3099);
    }

    tokio::spawn(async move {
        let _ = proxy.run().await;
    });

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // 3. Test DNS resolution via dig/nslookup equivalent (UDP query)
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.unwrap();
    // Build A record query for dd-auth.colima.local
    let query = build_dns_query("dd-auth.colima.local");
    socket.send_to(&query, "127.0.0.1:15553").await.unwrap();

    let mut buf = [0u8; 512];
    let (len, _) = socket.recv_from(&mut buf).await.unwrap();
    let response = &buf[..len];

    // Check response has answer (ANCOUNT > 0)
    let ancount = u16::from_be_bytes([response[6], response[7]]);
    assert!(ancount > 0, "DNS should return an answer");

    // Check IP is 127.0.0.1 (last 4 bytes of response)
    let ip_bytes = &response[len - 4..len];
    assert_eq!(ip_bytes, &[127, 0, 0, 1], "DNS should resolve to 127.0.0.1");
    println!("DNS: dd-auth.colima.local → 127.0.0.1 ✓");

    // 4. Test NXDOMAIN for unknown host
    let query_bad = build_dns_query("unknown.colima.local");
    socket.send_to(&query_bad, "127.0.0.1:15553").await.unwrap();
    let (len2, _) = socket.recv_from(&mut buf).await.unwrap();
    let rcode = buf[3] & 0x0F;
    assert_eq!(rcode, 3, "Unknown host should return NXDOMAIN");
    println!("DNS: unknown.colima.local → NXDOMAIN ✓");

    // 5. Test proxy routes (echo server on 3099 must be running)
    let client = reqwest::Client::new();
    let resp = client
        .get("http://127.0.0.1:17080/test")
        .header("Host", "echo.colima.local")
        .send()
        .await;

    if let Ok(r) = resp {
        if r.status() == 200 {
            let json: serde_json::Value = r.json().await.unwrap();
            println!("Proxy: echo.colima.local → :3099 → {} ✓", json["message"]);
        } else {
            println!("Proxy: echo.colima.local → :3099 (status {})", r.status());
        }
    } else {
        println!("Proxy: echo server on 3099 not running, skip proxy test");
    }

    // 6. Test proxy to ddocdoc-auth (port 3001)
    let resp2 = client
        .get("http://127.0.0.1:17080/")
        .header("Host", "dd-auth.colima.local")
        .send()
        .await;

    if let Ok(r) = resp2 {
        let status = r.status();
        let body = r.text().await.unwrap_or_default();
        println!("Proxy: dd-auth.colima.local → :3001 → {} {}", status, &body[..body.len().min(80)]);
    } else {
        println!("Proxy: ddocdoc-auth on 3001 not running, skip");
    }

    // Shutdown
    dns_shutdown.notify_one();
    proxy_shutdown.notify_one();
}

fn build_dns_query(name: &str) -> Vec<u8> {
    let mut packet = Vec::new();
    // Header
    packet.extend_from_slice(&[0xAA, 0xBB]); // ID
    packet.extend_from_slice(&[0x01, 0x00]); // Flags: standard query, RD=1
    packet.extend_from_slice(&[0x00, 0x01]); // QDCOUNT=1
    packet.extend_from_slice(&[0x00, 0x00]); // ANCOUNT=0
    packet.extend_from_slice(&[0x00, 0x00]); // NSCOUNT=0
    packet.extend_from_slice(&[0x00, 0x00]); // ARCOUNT=0
    // Question: encode name
    for label in name.split('.') {
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0x00); // Root
    packet.extend_from_slice(&[0x00, 0x01]); // Type A
    packet.extend_from_slice(&[0x00, 0x01]); // Class IN
    packet
}
