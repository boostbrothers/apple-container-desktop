use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::client::legacy::Client;
use hyper_util::rt::{TokioExecutor, TokioIo};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, Notify};

pub type RouteTable = Arc<Mutex<HashMap<String, u16>>>;

pub struct ProxyServer {
    routes: RouteTable,
    port: u16,
    shutdown: Arc<Notify>,
}

impl ProxyServer {
    pub fn new(port: u16) -> Self {
        Self {
            routes: Arc::new(Mutex::new(HashMap::new())),
            port,
            shutdown: Arc::new(Notify::new()),
        }
    }

    pub fn with_shared(port: u16, routes: RouteTable, shutdown: Arc<Notify>) -> Self {
        Self {
            routes,
            port,
            shutdown,
        }
    }

    pub fn routes(&self) -> RouteTable {
        Arc::clone(&self.routes)
    }

    pub fn shutdown_handle(&self) -> Arc<Notify> {
        Arc::clone(&self.shutdown)
    }

    pub async fn run(&self) -> Result<(), String> {
        // Bind to 0.0.0.0 — macOS 10.14+ allows unprivileged port 80 binding on 0.0.0.0
        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind proxy on port {}: {}", self.port, e))?;

        let shutdown = Arc::clone(&self.shutdown);
        let routes = Arc::clone(&self.routes);

        loop {
            tokio::select! {
                _ = shutdown.notified() => {
                    break;
                }
                result = listener.accept() => {
                    let (stream, peer) = match result {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    // Reject non-localhost connections (security: 0.0.0.0 binding)
                    if !peer.ip().is_loopback() {
                        continue;
                    }

                    let routes = Arc::clone(&routes);
                    tokio::spawn(async move {
                        let io = TokioIo::new(stream);
                        let _ = http1::Builder::new()
                            .preserve_header_case(true)
                            .serve_connection(
                                io,
                                service_fn(move |req| {
                                    let routes = Arc::clone(&routes);
                                    handle_request(req, routes)
                                }),
                            )
                            .with_upgrades()
                            .await;
                    });
                }
            }
        }

        Ok(())
    }
}

async fn handle_request(
    req: Request<Incoming>,
    routes: RouteTable,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    // Extract hostname from Host header
    let host = req
        .headers()
        .get(hyper::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_lowercase();

    // Strip .local suffix for lookup
    let lookup_key = host.trim_end_matches(".local").to_string();

    let target_port = {
        let table = routes.lock().await;
        // Try exact match first, then without .local
        table
            .get(&host)
            .or_else(|| table.get(&lookup_key))
            .copied()
    };

    let port = match target_port {
        Some(p) => p,
        None => {
            let body = format!(
                "No route found for host: {}\nRegistered routes: use mDNS settings to configure.",
                host
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Full::new(Bytes::from(body)))
                .unwrap());
        }
    };

    // Forward request to target
    let uri_string = format!(
        "http://127.0.0.1:{}{}",
        port,
        req.uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/")
    );

    let uri: hyper::Uri = match uri_string.parse() {
        Ok(u) => u,
        Err(e) => {
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Full::new(Bytes::from(format!("Invalid URI: {}", e))))
                .unwrap());
        }
    };

    // Build forwarded request
    let client = Client::builder(TokioExecutor::new()).build_http();

    let mut builder = Request::builder().method(req.method().clone()).uri(uri);

    // Copy headers
    for (key, value) in req.headers() {
        builder = builder.header(key, value);
    }

    let forwarded_req = match builder.body(req.into_body()) {
        Ok(r) => r,
        Err(e) => {
            return Ok(Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Full::new(Bytes::from(format!(
                    "Failed to build request: {}",
                    e
                ))))
                .unwrap());
        }
    };

    match client.request(forwarded_req).await {
        Ok(resp) => {
            let (parts, body) = resp.into_parts();
            let bytes = body
                .collect()
                .await
                .map(|c| c.to_bytes())
                .unwrap_or_default();
            let mut response = Response::new(Full::new(bytes));
            *response.status_mut() = parts.status;
            *response.headers_mut() = parts.headers;
            *response.version_mut() = parts.version;
            Ok(response)
        }
        Err(e) => Ok(Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Full::new(Bytes::from(format!(
                "Upstream error: {}",
                e
            ))))
            .unwrap()),
    }
}
