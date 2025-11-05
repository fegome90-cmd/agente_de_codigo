module.exports = {
  apps: [
    {
      name: 'pit-crew-orchestrator',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        OBS_PATH: '../../obs',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    },
    {
      name: 'pit-crew-security-agent',
      script: '../agents/src/security_agent.py',
      interpreter: 'python3',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: '../agents/logs/error.log',
      out_file: '../agents/logs/out.log',
      log_file: '../agents/logs/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'pit-crew-architecture-agent',
      script: '../architecture-agent/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: '../architecture-agent/logs/error.log',
      out_file: '../architecture-agent/logs/out.log',
      log_file: '../architecture-agent/logs/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'pit-crew-quality-agent',
      script: '../quality-agent/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: '../quality-agent/logs/error.log',
      out_file: '../quality-agent/logs/out.log',
      log_file: '../quality-agent/logs/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'pit-crew-documentation-agent',
      script: '../documentation-agent/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: '../documentation-agent/logs/error.log',
      out_file: '../documentation-agent/logs/out.log',
      log_file: '../documentation-agent/logs/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'pit-crew-pr-reviewer-agent',
      script: '../agents/pr-reviewer/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock'
      },
      error_file: '../agents/pr-reviewer/logs/error.log',
      out_file: '../agents/pr-reviewer/logs/out.log',
      log_file: '../agents/pr-reviewer/logs/combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    }
  ]
};
