#!/usr/bin/env python3
import json
import sys
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from typing import Any

import requests


BASE_DOMAIN = "hire.freshippo.com"
BASE_URL = f"https://{BASE_DOMAIN}"
COOKIE_URL = f"{BASE_URL}/"
CATEGORY_LIST_URL = f"{BASE_URL}/category/list"
POSITION_SEARCH_URL = f"{BASE_URL}/position/search"
XSRF_COOKIE_NAME = "XSRF-TOKEN"
COOKIE_CACHE_FILE = Path(__file__).with_name("cookies.txt")

HEADERS = {
    "content-type": "application/json",
}


def get_xsrf_token(session: requests.Session) -> str:
    token = session.cookies.get(XSRF_COOKIE_NAME, domain=BASE_DOMAIN)

    if token is None:
        token = session.cookies.get(XSRF_COOKIE_NAME)

    if not token:
        raise RuntimeError(f"Could not find {XSRF_COOKIE_NAME} in session cookies")

    return token


def build_cookie_header(session: requests.Session) -> str:
    return "; ".join(
        f"{cookie.name}={cookie.value}"
        for cookie in session.cookies
        if BASE_DOMAIN.endswith(cookie.domain.lstrip("."))
        or cookie.domain.lstrip(".").endswith(BASE_DOMAIN)
    )


def load_cached_cookies(session: requests.Session) -> None:
    if not COOKIE_CACHE_FILE.exists():
        return

    cookie_jar = MozillaCookieJar(str(COOKIE_CACHE_FILE))
    cookie_jar.load(ignore_discard=True, ignore_expires=False)
    session.cookies.update(cookie_jar)


def save_cached_cookies(session: requests.Session) -> None:
    cookie_jar = MozillaCookieJar(str(COOKIE_CACHE_FILE))

    for cookie in session.cookies:
        cookie_jar.set_cookie(cookie)

    cookie_jar.save(ignore_discard=True, ignore_expires=True)


def ensure_session_cookies(session: requests.Session) -> str:
    load_cached_cookies(session)

    try:
        return get_xsrf_token(session)
    except RuntimeError:
        pass

    cookie_response = session.get(COOKIE_URL, headers=HEADERS, timeout=20)
    cookie_response.raise_for_status()

    token = get_xsrf_token(session)
    save_cached_cookies(session)
    return token


def raise_for_block(response: requests.Response, endpoint: str) -> None:
    if response.status_code == 403:
        raise RuntimeError(
            f"Got 403 from {endpoint}. The session token may have expired, "
            "or the site may be applying additional traffic controls. "
            f"Response body: {response.text[:500]}"
        )

    response.raise_for_status()


def fetch_data() -> dict[str, Any]:
    session = requests.Session()

    token = ensure_session_cookies(session)

    category_payload = {
        "channel": "group_official_site",
        "language": "zh",
    }

    api_headers = {
        **HEADERS,
        "cookie": build_cookie_header(session),
    }

    api_response = session.post(
        CATEGORY_LIST_URL,
        params={"_csrf": token},
        headers=api_headers,
        json=category_payload,
        timeout=20,
    )

    raise_for_block(api_response, "category/list")

    search_payload = {
        "channel": "group_official_site",
        "language": "zh",
        "batchId": "",
        "categories": "",
        "deptCodes": [],
        "key": "",
        "pageIndex": 1,
        "pageSize": 10,
        "regions": "",
        "subCategories": "",
        "shareType": "",
        "shareId": "",
        "myReferralShareCode": "",
    }

    search_response = session.post(
        POSITION_SEARCH_URL,
        params={"_csrf": token},
        headers=api_headers,
        json=search_payload,
        timeout=20,
    )

    raise_for_block(search_response, "position/search")

    return {
        "categories": api_response.json(),
        "positions": search_response.json(),
    }


def main() -> int:
    try:
        data = fetch_data()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(data, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
