#!/usr/bin/env python3

import requests

def test_email_webhook():
    url = "https://daf47820-7f0c-4127-926d-69f7ca178fbc-00-ku01l6bih555.kirk.replit.dev/api/email-ingest"
    
    headers = {
        'x-test-bypass': 'email-pdf-test',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    data = {
        'timestamp': '1754925000',
        'token': 'testtoken',
        'signature': 'testsig',
        'recipient': 'upload+94a7b7f0-3266-4a4f-9d4e-875542d30e62@myhome-tech.com',
        'sender': 'test@example.com',
        'subject': 'Test PDF Browser Fix',
        'body-plain': 'Testing with browser dependencies fixed',
        'body-html': '<html><body><h1>Test PDF Browser Fix</h1><p>This should now work with the browser dependencies resolved.</p></body></html>',
        'Message-Id': 'test-browser-fix-success'
    }
    
    try:
        response = requests.post(url, headers=headers, data=data, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        return response.status_code, response.text
    except Exception as e:
        print(f"Error: {e}")
        return None, str(e)

if __name__ == "__main__":
    test_email_webhook()