use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let url: String = if cfg!(debug_assertions) {
        "http://localhost:3789".to_string()
      } else {
        let port = find_free_port();
        spawn_server(app.handle(), port)?;
        wait_for_port("127.0.0.1", port, Duration::from_secs(30))?;
        format!("http://127.0.0.1:{}", port)
      };

      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
        .title("TIMO")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .resizable(true)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn find_free_port() -> u16 {
  TcpListener::bind("127.0.0.1:0")
    .expect("failed to bind ephemeral port")
    .local_addr()
    .expect("local addr")
    .port()
}

fn wait_for_port(host: &str, port: u16, timeout: Duration) -> Result<(), Box<dyn std::error::Error>> {
  let addr: std::net::SocketAddr = format!("{}:{}", host, port).parse()?;
  let start = Instant::now();
  while start.elapsed() < timeout {
    if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
      return Ok(());
    }
    std::thread::sleep(Duration::from_millis(200));
  }
  Err(format!("timeout waiting for sidecar on {}", addr).into())
}

fn spawn_server(handle: &tauri::AppHandle, port: u16) -> Result<(), Box<dyn std::error::Error>> {
  let resource_dir = handle.path().resource_dir()?;
  let server_dir = resource_dir.join("server-resources");
  let server_js = server_dir.join("server.js");

  let sidecar = handle
    .shell()
    .sidecar("node")?
    .args([server_js.to_string_lossy().to_string()])
    .env("PORT", port.to_string())
    .env("HOSTNAME", "127.0.0.1")
    .env("NODE_ENV", "production")
    .current_dir(&server_dir);

  let (mut rx, _child) = sidecar.spawn()?;

  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => {
          log::info!("[server] {}", String::from_utf8_lossy(&line));
        }
        CommandEvent::Stderr(line) => {
          log::warn!("[server] {}", String::from_utf8_lossy(&line));
        }
        _ => {}
      }
    }
  });

  Ok(())
}
