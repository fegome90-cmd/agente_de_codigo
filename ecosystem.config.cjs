module.exports = {
  apps: [
    // Main Orchestrator
    {
      name: "orchestrator",
      script: "node",
      args: "packages/orchestrator/dist/index.js",
      cwd: "/Users/felipe/Developer/agente_de_codigo",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        OBS_PATH: "./obs",
        SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        PIT_CREW_SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        ANTHROPIC_API_KEY:
          process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key",
        GLM_API_KEY: process.env.GLM_API_KEY || "your-glm-api-key",
        MEMTECH_URL: "http://memtech:8080",
        REDIS_URL: "redis://redis:6379",
      },
      error_file: "./obs/logs/orchestrator-error.log",
      out_file: "./obs/logs/orchestrator-out.log",
      log_file: "./obs/logs/orchestrator-combined.log",
      time: true,
    },

    // Security Agent (Python)
    {
      name: "security-agent",
      script: "python3",
      args: "packages/agents/src/security_agent.py",
      cwd: "/Users/felipe/Developer/agente_de_codigo",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        PYTHONPATH:
          "/Users/felipe/Developer/agente_de_codigo/packages/agents/src",
        OBS_PATH: "./obs",
        SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        PIT_CREW_SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        MEMTECH_URL: "http://memtech:8080",
        REDIS_URL: "redis://redis:6379",
      },
      error_file: "./obs/logs/security-agent-error.log",
      out_file: "./obs/logs/security-agent-out.log",
      log_file: "./obs/logs/security-agent-combined.log",
      time: true,
    },

    // Quality Agent (Python)
    {
      name: "quality-agent",
      script: "python3",
      args: "packages/agents/src/quality_agent.py",
      cwd: "/Users/felipe/Developer/agente_de_codigo",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        PYTHONPATH:
          "/Users/felipe/Developer/agente_de_codigo/packages/agents/src",
        OBS_PATH: "./obs",
        SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        PIT_CREW_SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        MEMTECH_URL: "http://memtech:8080",
        REDIS_URL: "redis://redis:6379",
      },
      error_file: "./obs/logs/quality-agent-error.log",
      out_file: "./obs/logs/quality-agent-out.log",
      log_file: "./obs/logs/quality-agent-combined.log",
      time: true,
    },

    // Documentation Agent (TypeScript)
    {
      name: "documentation-agent",
      script: "node",
      args: "packages/documentation-agent/dist/index.js",
      cwd: "/Users/felipe/Developer/agente_de_codigo",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
        OBS_PATH: "./obs",
        SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        PIT_CREW_SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        MEMTECH_URL: "http://memtech:8080",
      },
      error_file: "./obs/logs/documentation-agent-error.log",
      out_file: "./obs/logs/documentation-agent-out.log",
      log_file: "./obs/logs/documentation-agent-combined.log",
      time: true,
    },

    // PR Reviewer Meta-Agent (TypeScript)
    {
      name: "pr-reviewer-agent",
      script: "node",
      args: "packages/agents/pr-reviewer/dist/index.js",
      cwd: "/Users/felipe/Developer/agente_de_codigo",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        OBS_PATH: "./obs",
        SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        PIT_CREW_SOCKET_PATH: "/tmp/pit-crew-orchestrator.sock",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        GLM_API_KEY: process.env.GLM_API_KEY,
        MEMTECH_URL: "http://memtech:8080",
      },
      error_file: "./obs/logs/pr-reviewer-agent-error.log",
      out_file: "./obs/logs/pr-reviewer-agent-out.log",
      log_file: "./obs/logs/pr-reviewer-agent-combined.log",
      time: true,
    },
  ],

  // Deployment configuration
  deploy: {
    development: {
      user: "node",
      host: "localhost",
      ref: "origin/main",
      repo: "git@github.com:user/agente-de-codigo.git",
      path: "/Users/felipe/Developer/agente_de_codigo",
      "pre-deploy-local": "",
      "post-deploy": "pm2 reload ecosystem.config.cjs --env development",
      "pre-setup": "",
    },
  },
};
