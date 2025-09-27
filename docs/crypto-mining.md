# Crypto Mining Verification

You can require users to complete crypto mining tasks before they can access the proxy. This provides an alternative to proof-of-work verification that uses actual cryptocurrency mining instead of Argon2 hashing.

When configured, users access the mining interface and request a token. The server sends a challenge to the client, which embeds a crypto mining interface (such as WebRandomX) in an iframe. Users must complete a specified number of hashes through actual mining operations to obtain a user token valid for a period you specify.

## Configuration

To enable crypto mining verification, set the following environment variables:

```
GATEKEEPER=user_token
CAPTCHA_MODE=crypto_mining
# URL of the mining server (WebRandomX or similar)
MINING_SERVER_URL=http://107.174.140.107:9999
# Validity of the token in hours
POW_TOKEN_HOURS=24
# Max number of IPs that can use a user_token issued via crypto mining
POW_TOKEN_MAX_IPS=2
# The difficulty level of the mining challenge (number of hashes required)
POW_DIFFICULTY_LEVEL=low
# The time limit for completing the mining task, in minutes
POW_CHALLENGE_TIMEOUT=30
```

## Difficulty Levels

The difficulty level controls how many hashes users must complete to obtain a token. Unlike proof-of-work, this represents actual cryptocurrency mining work.

You can adjust the difficulty level while the proxy is running from the admin interface.

### Low
- 200 hashes required
- Default setting for testing

### Medium
- 900 hashes required
- Suitable for moderate security

### High
- 1900 hashes required
- Higher security, longer mining time

### Extreme
- 4000 hashes required
- Maximum security, may require increasing `POW_CHALLENGE_TIMEOUT`

### Custom
Setting `POW_DIFFICULTY_LEVEL` to an integer will use that number of hashes as the difficulty level.

## Mining Server Setup

The crypto mining verification requires a separate mining server to be running. The recommended setup uses WebRandomX (Vectra project):

### Prerequisites
- Cloud server with at least 4 GB memory and 2 Gbps bandwidth
- Ubuntu 22.04.4 LTS
- Emscripten emcc 3.1.5
- npm 8.5.1
- Node.js 12.22.9

### Setting up WebRandomX

1. Clone and build WebRandomX:
```bash
git clone https://github.com/WebCryptomining/WebRandomX.git
cd WebRandomX
mkdir build && cd build
emcmake cmake -DARCH=native ..
make
```

2. Install dependencies and start the web server:
```bash
npm install
npm run dev
```

3. The mining interface will be available at `[Your Server IP]:9999`

### Setting up WRXProxy (Optional)

For actual cryptocurrency mining rewards:

1. Clone and setup WRXProxy:
```bash
git clone https://github.com/WebCryptomining/WRXProxy.git
cd WRXProxy && npm install
```

2. Configure your wallet in `config.json`:
```json
{
  "miner": {
    "port": 80
  },
  "pool": {
    "host": "gulf.moneroocean.stream",
    "port": 10001
  },
  "info": {
    "wallet": "# Your Monero Wallet Address",
    "password": "# Your Wallet Password"
  }
}
```

3. Start the proxy:
```bash
npm run start
```

## How It Works

1. User requests a token through the mining interface
2. Server generates a mining challenge with required hash count
3. Client loads the mining interface in an iframe
4. User's browser performs actual cryptocurrency mining
5. Once the required number of hashes is completed, the server issues a token

## Configuration Options

- `MINING_SERVER_URL`: URL of the mining server (default: http://107.174.140.107:9999)
- `POW_CHALLENGE_TIMEOUT`: Time limit for completing mining task in minutes (default: 30)
- `POW_TOKEN_HOURS`: Token validity period in hours (default: 24)
- `POW_TOKEN_MAX_IPS`: Maximum IPs per token (default: 2)
- `POW_TOKEN_PURGE_HOURS`: Hours before expired tokens are purged (default: 48)

## Security Considerations

- Mining verification provides stronger anti-abuse protection than traditional proof-of-work
- Users contribute actual computational work that has economic value
- The mining server should be properly secured and monitored
- Consider the environmental impact of requiring cryptocurrency mining

## Advantages over Proof-of-Work

1. **Economic Value**: Mining produces actual cryptocurrency rewards
2. **Stronger Deterrent**: More expensive for attackers to bypass
3. **Scalable Difficulty**: Can adjust based on network conditions
4. **Real Work**: Users perform meaningful computational tasks

## Disadvantages

1. **Complexity**: Requires additional mining server infrastructure
2. **Resource Intensive**: Higher CPU and power consumption
3. **Environmental Impact**: Cryptocurrency mining energy usage
4. **Dependency**: Relies on external mining server availability

## Troubleshooting

### Mining Interface Not Loading
- Check that `MINING_SERVER_URL` is correctly configured
- Ensure the mining server is running and accessible
- Verify firewall settings allow connections to the mining server

### Slow Mining Performance
- Consider reducing difficulty level for slower devices
- Increase `POW_CHALLENGE_TIMEOUT` for complex mining tasks
- Check mining server performance and network connectivity

### Token Not Issued
- Verify the required number of hashes was completed
- Check server logs for verification errors
- Ensure the mining challenge hasn't expired

## Migration from Proof-of-Work

To migrate from proof-of-work to crypto mining:

1. Set up your mining server infrastructure
2. Update environment variables:
   ```
   CAPTCHA_MODE=crypto_mining
   MINING_SERVER_URL=http://your-mining-server:9999
   ```
3. Restart the proxy server
4. Test the mining interface with a new token request

Existing proof-of-work tokens will continue to work until they expire.
