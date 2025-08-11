#!/usr/bin/env python3

import requests
import time

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
        'subject': 'Email Auto-PDF Test - Feature Flag Enabled',
        'body-plain': 'Testing email body to PDF conversion with feature flag enabled. This email has no attachments and should be automatically converted to a PDF.',
        'body-html': '<html><body><h1>Email Auto-PDF Test</h1><p>Feature flag is now enabled at 100% rollout.</p><p>This email body should be automatically converted to a PDF document since it has no attachments.</p><ul><li>Worker initialized successfully</li><li>Browser dependencies resolved</li><li>Feature flag: EMAIL_PDF_AUTO_NO_ATTACHMENTS enabled</li></ul></body></html>',
        'Message-Id': 'auto-pdf-test-' + str(int(time.time()))
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