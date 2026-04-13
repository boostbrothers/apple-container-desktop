use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::{Mutex, Notify};

pub type DnsTable = Arc<Mutex<HashMap<String, Ipv4Addr>>>;

pub struct DnsServer {
    table: DnsTable,
    port: u16,
    shutdown: Arc<Notify>,
}

impl DnsServer {
    pub fn new(port: u16) -> Self {
        Self {
            table: Arc::new(Mutex::new(HashMap::new())),
            port,
            shutdown: Arc::new(Notify::new()),
        }
    }

    pub fn with_shared(port: u16, table: DnsTable, shutdown: Arc<Notify>) -> Self {
        Self {
            table,
            port,
            shutdown,
        }
    }

    pub fn table(&self) -> DnsTable {
        Arc::clone(&self.table)
    }

    pub fn shutdown_handle(&self) -> Arc<Notify> {
        Arc::clone(&self.shutdown)
    }

    pub async fn run(&self) -> Result<(), String> {
        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        let socket = UdpSocket::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind DNS on port {}: {}", self.port, e))?;

        let mut buf = [0u8; 512];
        let shutdown = Arc::clone(&self.shutdown);
        let table = Arc::clone(&self.table);

        loop {
            tokio::select! {
                _ = shutdown.notified() => break,
                result = socket.recv_from(&mut buf) => {
                    let (len, src) = match result {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let request = &buf[..len];
                    if let Some(response) = handle_dns_query(request, &table).await {
                        let _ = socket.send_to(&response, src).await;
                    }
                }
            }
        }

        Ok(())
    }
}

/// DNS answer variants for A (IPv4) and AAAA (IPv6) records.
enum DnsAnswer {
    A(Ipv4Addr),
    Aaaa(Ipv6Addr),
}

/// Parse a DNS query and return a response for A or AAAA record queries
/// for a name in our table. Minimal DNS implementation — just enough
/// for /etc/resolver integration.
async fn handle_dns_query(packet: &[u8], table: &DnsTable) -> Option<Vec<u8>> {
    // DNS header is 12 bytes minimum
    if packet.len() < 12 {
        return None;
    }

    let id = &packet[0..2];
    let flags = u16::from_be_bytes([packet[2], packet[3]]);

    // Only handle standard queries (QR=0, OPCODE=0)
    if flags & 0x7800 != 0 {
        return None;
    }

    let qdcount = u16::from_be_bytes([packet[4], packet[5]]);
    if qdcount == 0 {
        return None;
    }

    // Parse question section — extract domain name
    let (name, qname_end) = parse_dns_name(packet, 12)?;
    if qname_end + 4 > packet.len() {
        return None;
    }

    let qtype = u16::from_be_bytes([packet[qname_end], packet[qname_end + 1]]);
    let qclass = u16::from_be_bytes([packet[qname_end + 2], packet[qname_end + 3]]);

    // Only handle A (type 1) and AAAA (type 28) records, IN class (1)
    if qclass != 1 || (qtype != 1 && qtype != 28) {
        return Some(build_dns_response(id, packet, qname_end + 4, None));
    }

    let name_lower = name.to_lowercase();

    // Look up in table — try exact match, then wildcard
    let found = {
        let tbl = table.lock().await;
        let exact = tbl.get(&name_lower).copied();
        if exact.is_some() {
            exact
        } else {
            // Wildcard: if query is "sub.app.colima.local", try "app.colima.local"
            let parts: Vec<&str> = name_lower.splitn(2, '.').collect();
            if parts.len() == 2 {
                tbl.get(parts[1]).copied()
            } else {
                None
            }
        }
    };

    let answer = found.map(|ipv4| match qtype {
        28 => DnsAnswer::Aaaa(Ipv6Addr::LOCALHOST),
        _ => DnsAnswer::A(ipv4),
    });

    Some(build_dns_response(id, packet, qname_end + 4, answer))
}

fn build_dns_response(
    id: &[u8],
    request: &[u8],
    question_end: usize,
    answer: Option<DnsAnswer>,
) -> Vec<u8> {
    let mut resp = Vec::with_capacity(question_end + 28);

    // Header
    resp.extend_from_slice(id); // Transaction ID
    if answer.is_some() {
        // QR=1, AA=1, RD=1, RA=1, RCODE=0 (no error)
        resp.extend_from_slice(&[0x85, 0x80]);
    } else {
        // QR=1, AA=1, RD=1, RA=1, RCODE=3 (NXDOMAIN)
        resp.extend_from_slice(&[0x85, 0x83]);
    }
    resp.extend_from_slice(&[0x00, 0x01]); // QDCOUNT=1
    if answer.is_some() {
        resp.extend_from_slice(&[0x00, 0x01]); // ANCOUNT=1
    } else {
        resp.extend_from_slice(&[0x00, 0x00]); // ANCOUNT=0
    }
    resp.extend_from_slice(&[0x00, 0x00]); // NSCOUNT=0
    resp.extend_from_slice(&[0x00, 0x00]); // ARCOUNT=0

    // Question section — copy from request
    resp.extend_from_slice(&request[12..question_end]);

    // Answer section
    if let Some(ans) = answer {
        // Name pointer to question name (offset 12)
        resp.extend_from_slice(&[0xC0, 0x0C]);
        match ans {
            DnsAnswer::A(addr) => {
                resp.extend_from_slice(&[0x00, 0x01]); // Type A
                resp.extend_from_slice(&[0x00, 0x01]); // Class IN
                resp.extend_from_slice(&[0x00, 0x00, 0x00, 0x05]); // TTL = 5s
                resp.extend_from_slice(&[0x00, 0x04]); // RDLENGTH = 4
                resp.extend_from_slice(&addr.octets());
            }
            DnsAnswer::Aaaa(addr) => {
                resp.extend_from_slice(&[0x00, 0x1C]); // Type AAAA (28)
                resp.extend_from_slice(&[0x00, 0x01]); // Class IN
                resp.extend_from_slice(&[0x00, 0x00, 0x00, 0x05]); // TTL = 5s
                resp.extend_from_slice(&[0x00, 0x10]); // RDLENGTH = 16
                resp.extend_from_slice(&addr.octets());
            }
        }
    }

    resp
}

/// Parse a DNS name from a packet at the given offset.
/// Returns (decoded_name, offset_after_name).
fn parse_dns_name(packet: &[u8], start: usize) -> Option<(String, usize)> {
    let mut parts = Vec::new();
    let mut pos = start;

    loop {
        if pos >= packet.len() {
            return None;
        }
        let len = packet[pos] as usize;
        if len == 0 {
            pos += 1;
            break;
        }
        // Compression pointer (0xC0)
        if len & 0xC0 == 0xC0 {
            if pos + 1 >= packet.len() {
                return None;
            }
            let ptr = ((len & 0x3F) << 8 | packet[pos + 1] as usize) as usize;
            let (rest, _) = parse_dns_name(packet, ptr)?;
            parts.push(rest);
            pos += 2;
            break;
        }
        pos += 1;
        if pos + len > packet.len() {
            return None;
        }
        let label = std::str::from_utf8(&packet[pos..pos + len]).ok()?;
        parts.push(label.to_string());
        pos += len;
    }

    Some((parts.join("."), pos))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dns_name() {
        // "dd-auth.colima.local" encoded as DNS name
        let packet = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // header
            0x07, b'd', b'd', b'-', b'a', b'u', b't', b'h', // "dd-auth"
            0x06, b'c', b'o', b'l', b'i', b'm', b'a', // "colima"
            0x05, b'l', b'o', b'c', b'a', b'l', // "local"
            0x00, // root
        ];
        let (name, end) = parse_dns_name(&packet, 12).unwrap();
        assert_eq!(name, "dd-auth.colima.local");
        assert_eq!(end, 34); // 12 (header) + 1+7 + 1+6 + 1+5 + 1 (null terminator)
    }

    #[test]
    fn test_build_a_response() {
        let id = [0x12, 0x34];
        // Minimal request with question
        let request = [
            0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x07, b'd', b'd', b'-', b'a', b'u', b't', b'h',
            0x06, b'c', b'o', b'l', b'i', b'm', b'a',
            0x05, b'l', b'o', b'c', b'a', b'l',
            0x00,
            0x00, 0x01, // Type A
            0x00, 0x01, // Class IN
        ];
        let question_end = request.len();
        let ip = Ipv4Addr::new(127, 0, 0, 1);
        let resp = build_dns_response(&id, &request, question_end, Some(DnsAnswer::A(ip)));

        // Check transaction ID
        assert_eq!(resp[0..2], [0x12, 0x34]);
        // Check ANCOUNT = 1
        assert_eq!(resp[6..8], [0x00, 0x01]);
        // Check Type A (0x0001) in answer section
        let answer_start = question_end + 2; // after name pointer (0xC0, 0x0C)
        assert_eq!(resp[answer_start..answer_start + 2], [0x00, 0x01]);
        // Check RDLENGTH = 4
        assert_eq!(resp[answer_start + 8..answer_start + 10], [0x00, 0x04]);
        // Check IPv4 at the end
        let ip_offset = resp.len() - 4;
        assert_eq!(resp[ip_offset..], [127, 0, 0, 1]);
    }

    #[test]
    fn test_build_aaaa_response() {
        let id = [0x56, 0x78];
        let request = [
            0x56, 0x78, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x07, b'd', b'd', b'-', b'a', b'u', b't', b'h',
            0x06, b'c', b'o', b'l', b'i', b'm', b'a',
            0x05, b'l', b'o', b'c', b'a', b'l',
            0x00,
            0x00, 0x1C, // Type AAAA (28)
            0x00, 0x01, // Class IN
        ];
        let question_end = request.len();
        let resp = build_dns_response(
            &id,
            &request,
            question_end,
            Some(DnsAnswer::Aaaa(Ipv6Addr::LOCALHOST)),
        );

        // Check transaction ID
        assert_eq!(resp[0..2], [0x56, 0x78]);
        // Check ANCOUNT = 1
        assert_eq!(resp[6..8], [0x00, 0x01]);
        // Check Type AAAA (0x001C) in answer section
        let answer_start = question_end + 2; // after name pointer
        assert_eq!(resp[answer_start..answer_start + 2], [0x00, 0x1C]);
        // Check RDLENGTH = 16
        assert_eq!(resp[answer_start + 8..answer_start + 10], [0x00, 0x10]);
        // Check IPv6 ::1 at the end (15 zero bytes + 0x01)
        let ip_offset = resp.len() - 16;
        let mut expected = [0u8; 16];
        expected[15] = 1;
        assert_eq!(resp[ip_offset..], expected);
    }

    #[test]
    fn test_build_nxdomain_response() {
        let id = [0xAB, 0xCD];
        let request = [
            0xAB, 0xCD, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x07, b'u', b'n', b'k', b'n', b'o', b'w', b'n',
            0x05, b'l', b'o', b'c', b'a', b'l',
            0x00,
            0x00, 0x01,
            0x00, 0x01,
        ];
        let question_end = request.len();
        let resp = build_dns_response(&id, &request, question_end, None);

        // RCODE = 3 (NXDOMAIN)
        assert_eq!(resp[3] & 0x0F, 3);
        // ANCOUNT = 0
        assert_eq!(resp[6..8], [0x00, 0x00]);
    }
}
