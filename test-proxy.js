const http = require('http');

// 使用ADMIN_KEY进行认证
const ADMIN_KEY = 'admin_sk_d8a7b7c6e5f4d3c2b1a0f9e8d7c6b5a4';

// 测试配置
const tests = [
  {
    name: 'OpenAI API Test',
    path: '/proxy/openai/v1/chat/completions',
    key: ADMIN_KEY,  // 使用ADMIN_KEY而不是API密钥
    body: {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }
  },
  {
    name: 'Anthropic API Test',
    path: '/proxy/anthropic/v1/chat/completions',
    key: ADMIN_KEY,  // 使用ADMIN_KEY而不是API密钥
    body: {
      model: 'claude-3-sonnet-20240229',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }
  },
  {
    name: 'Google AI API Test',
    path: '/proxy/google-ai/v1/chat/completions',
    key: ADMIN_KEY,  // 使用ADMIN_KEY而不是API密钥
    body: {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }
  }
];

// 运行测试
async function runTest(test) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(test.body);
    
    const options = {
      hostname: 'localhost',
      port: 7861,
      path: test.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${test.key}`
      }
    };
    
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log(`   Path: ${test.path}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log(`   ✅ Success! Response:`, JSON.stringify(parsed).substring(0, 100) + '...');
          } catch (e) {
            console.log(`   ✅ Success! Response received (non-JSON)`);
          }
        } else {
          console.log(`   ❌ Error: ${data}`);
        }
        resolve();
      });
    });
    
    req.on('error', (e) => {
      console.log(`   ❌ Network error: ${e.message}`);
      resolve();
    });
    
    req.write(postData);
    req.end();
  });
}

// 运行所有测试
async function runAllTests() {
  console.log('='.repeat(50));
  console.log('🚀 Testing Proxy Endpoints');
  console.log('='.repeat(50));
  
  for (const test of tests) {
    await runTest(test);
    // 等待一秒避免速率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Test Complete!');
  console.log('='.repeat(50));
}

runAllTests();
