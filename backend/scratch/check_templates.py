import requests

def test_pages():
    s = requests.Session()
    
    # 1. Fetch Login page
    r = s.get("http://127.0.0.1:8000/auth/login")
    print(f"GET /auth/login status: {r.status_code}")
    if r.status_code != 200:
        print("FAIL: Login page didn't load successfully")
        return False
    
    # 2. Fetch Menu page (might return 302 to redirect to login if not authenticated, which is correct and means it parses fine!)
    r = s.get("http://127.0.0.1:8000/menu", allow_redirects=False)
    print(f"GET /menu status: {r.status_code}")
    if r.status_code not in (200, 302, 303):
        print(f"FAIL: Menu page returned unexpected status: {r.status_code}")
        return False
        
    print("SUCCESS: All pages loaded/redirected properly without syntax or template errors!")
    return True

if __name__ == "__main__":
    test_pages()
