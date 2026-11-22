import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 跨平台 Docker Compose 启动包装器：
 * - 若宿主机已直接安装 docker CLI，则直接运行 `docker compose ...`
 * - 若在 Windows 下仅 WSL2 内安装了 Docker Engine，则自动透明转发至 `wsl -- docker compose ...`
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const composeArgs = process.argv.slice(2);

if (composeArgs.length === 0) {
  console.error("[db] 用法: node scripts/docker-compose.mjs <up -d|down|logs -f postgres|ps>");
  process.exit(1);
}

// 优先探测宿主机原生 docker compose
const nativeCheck = spawnSync("docker", ["compose", "version"], {
  stdio: "ignore",
  cwd: workspaceRoot,
});

if (nativeCheck.status === 0) {
  const res = spawnSync("docker", ["compose", ...composeArgs], {
    stdio: "inherit",
    cwd: workspaceRoot,
  });
  process.exit(res.status ?? 1);
}

// Windows 宿主机回退至 WSL2 Docker
if (process.platform === "win32") {
  const wslCheck = spawnSync("wsl", ["--", "docker", "compose", "version"], {
    stdio: "ignore",
    cwd: workspaceRoot,
  });
  if (wslCheck.status === 0) {
    const res = spawnSync("wsl", ["--", "docker", "compose", ...composeArgs], {
      stdio: "inherit",
      cwd: workspaceRoot,
    });
    process.exit(res.status ?? 1);
  }
}

console.error(
  "[db] 未检测到可用的 Docker Compose（宿主机与 WSL 均不可用）。请确认 Docker Engine 已启动。"
);
process.exit(1);
