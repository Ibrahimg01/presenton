import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { provisionAuthentication } from "./security/auth-file.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastapiDir = join(__dirname, "servers/fastapi");
const nextjsDir = join(__dirname, "servers/nextjs");

const args = process.argv.slice(2);
const hasDevArg = args.includes("--dev") || args.includes("-d");
const isDev = hasDevArg;
// Provider credentials are server-managed in hosted deployments.
process.env.CAN_CHANGE_KEYS = "false";

const fastapiPort = 8000;
const nextjsPort = 3000;
const appmcpPort = 8001;

const userConfigPath = join(process.env.APP_DATA_DIRECTORY, "userConfig.json");
const userDataDir = dirname(userConfigPath);

// Create user_data directory if it doesn't exist
if (!existsSync(userDataDir)) {
  mkdirSync(userDataDir, { recursive: true });
}

// Setup node_modules for development
const setupNodeModules = () => {
  return new Promise((resolve, reject) => {
    console.log("Setting up node_modules for Next.js...");
    const npmProcess = spawn("npm", ["install"], {
      cwd: nextjsDir,
      stdio: "inherit",
      env: process.env,
    });

    npmProcess.on("error", (err) => {
      console.error("npm install failed:", err);
      reject(err);
    });

    npmProcess.on("exit", (code) => {
      if (code === 0) {
        console.log("npm install completed successfully");
        resolve();
      } else {
        console.error(`npm install failed with exit code: ${code}`);
        reject(new Error(`npm install failed with exit code: ${code}`));
      }
    });
  });
};

process.env.USER_CONFIG_PATH = userConfigPath;

const startServers = async () => {
  const fastApiProcess = spawn(
    "python",
    [
      "server.py",
      "--port",
      fastapiPort.toString(),
      "--reload",
      isDev ? "true" : "false",
    ],
    {
      cwd: fastapiDir,
      stdio: "inherit",
      env: process.env,
    }
  );

  fastApiProcess.on("error", (err) => {
    console.error("FastAPI process failed to start:", err);
  });

  const appmcpProcess = spawn(
    "python",
    ["mcp_server.py", "--port", appmcpPort.toString()],
    {
      cwd: fastapiDir,
      stdio: "ignore",
      env: process.env,
    }
  );

  appmcpProcess.on("error", (err) => {
    console.error("App MCP process failed to start:", err);
  });

  const nextjsProcess = spawn(
    "npm",
    ["run", isDev ? "dev" : "start", "--", "-p", nextjsPort.toString(), "-H", "127.0.0.1"],
    {
      cwd: nextjsDir,
      stdio: "inherit",
      env: process.env,
    }
  );

  nextjsProcess.on("error", (err) => {
    console.error("Next.js process failed to start:", err);
  });

  const ollamaProcess = spawn("ollama", ["serve"], {
    cwd: "/",
    stdio: "inherit",
    env: process.env,
  });

  ollamaProcess.on("error", (err) => {
    console.error("Ollama process failed to start:", err);
  });

  // Keep the Node process alive until both servers exit
  const exitCode = await Promise.race([
    new Promise((resolve) => fastApiProcess.on("exit", resolve)),
    new Promise((resolve) => nextjsProcess.on("exit", resolve)),
    new Promise((resolve) => ollamaProcess.on("exit", resolve)),
  ]);

  console.log(`One of the processes exited. Exit code: ${exitCode}`);
  process.exit(exitCode);
};

// Start nginx service
const startNginx = () => {
  const nginxProcess = spawn("service", ["nginx", "start"], {
    stdio: "inherit",
    env: process.env,
  });

  nginxProcess.on("error", (err) => {
    console.error("Nginx process failed to start:", err);
  });

  nginxProcess.on("exit", (code) => {
    if (code === 0) {
      console.log("Nginx started successfully");
    } else {
      console.error(`Nginx failed to start with exit code: ${code}`);
    }
  });
};

const main = async () => {
  // Validate access controls before starting any listening process.
  provisionAuthentication(process.env.PRESENTON_HTPASSWD);
  delete process.env.PRESENTON_HTPASSWD;
  if (isDev) {
    await setupNodeModules();
  }

  startServers();
  startNginx();
};

main();
