#!/usr/bin/env python3
"""Default: read-only preflight. --send requires a separate typed approval."""
import argparse
import getpass
import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://smajpihub.onrender.com"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true", help="Offer to send after successful preflight and typed approval")
    args = parser.parse_args()
    token = getpass.getpass("Admin Hub access token (hidden): ").strip()
    if not token.startswith("hub_access.") or any(c.isspace() for c in token):
        raise SystemExit("Use the current admin Hub access token, not an API key, seed or refresh token.")

    def request(path, payload=None):
        headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode()
        req = urllib.request.Request(BASE + path, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            try:
                message = json.load(error).get("message", "Request rejected")
            except (ValueError, AttributeError):
                message = "Request rejected"
            raise SystemExit(f"HTTP {error.code}: {message}. Stop; do not bypass a payout lock.") from None
        except (urllib.error.URLError, TimeoutError):
            raise SystemExit("Connection failed or timed out. If sending, reconcile before any retry.") from None

    user = request("/user").get("user") or {}
    if user.get("role") != "admin" or not user.get("uid"):
        raise SystemExit("This credential does not resolve to a current administrator.")
    print("Admin identity verified. Your app-specific UID:", user["uid"])
    uid = input("Recipient verified UID (Enter to pay your own account): ").strip() or user["uid"]
    check = request("/admin/testnet/a2u/preflight?" + urllib.parse.urlencode({"uid": uid}))
    if check.get("checksPassed") is not True or check.get("paymentSent") is not False:
        raise SystemExit("Preflight did not pass. No payment requested.")
    print(json.dumps(check, indent=2))
    if not args.send:
        print("Read-only check finished. No payment sent. Use --send only after approving the recipient and portal wallet match.")
        return
    if input("Does senderWalletAddress match the connected TESTNET wallet in Pi Developer Portal? Type YES: ").strip() != "YES":
        raise SystemExit("Stopped. No payment sent.")
    approval = f"SEND 0.01 TEST-PI TO {uid}"
    if input(f"To approve this one payout, type exactly: {approval}\n").strip() != approval:
        raise SystemExit("Stopped. No payment sent.")
    payout = request("/admin/testnet/a2u", {"uid": uid}).get("payout") or {}
    print(json.dumps({key: payout.get(key) for key in ("status", "amount", "network", "paymentId", "txid", "recipientWalletAddress")}, indent=2))
    if payout.get("status") != "completed":
        raise SystemExit("Completion not confirmed. Reconcile before any retry.")


if __name__ == "__main__":
    main()
