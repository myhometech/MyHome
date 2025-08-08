module.exports = {
  apps: [{
    name: 'myhome-server',
    script: 'dist/index.js',
    instances: process.env.PM2_INSTANCES || 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_staging: {
      NODE_ENV: 'staging', 
      PORT: 5000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/dev/stderr',
    out_file: '/dev/stdout',
    log_file: '/dev/stdout',
    merge_logs: true,
    time: true
  }]
};