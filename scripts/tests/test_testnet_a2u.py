import importlib.util
import io
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('payout_helper', Path(__file__).parents[1] / 'testnet-a2u.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class HelperSafetyTests(unittest.TestCase):
    def run_helper(self, args, answers):
        requests = []

        def response(req, timeout):
            requests.append(req)
            if req.full_url.endswith('/user'):
                data = '{"user":{"role":"admin","uid":"verified-admin"}}'
            elif '/preflight?' in req.full_url:
                data = '{"checksPassed":true,"paymentSent":false}'
            else:
                data = '{"payout":{"status":"completed","amount":0.01}}'
            return io.StringIO(data)

        with patch('sys.argv', ['testnet-a2u.py'] + args), patch.object(helper.getpass, 'getpass', return_value='hub_access.test.only'), patch('builtins.input', side_effect=answers), patch.object(helper.urllib.request, 'urlopen', side_effect=response), patch('sys.stdout', new_callable=io.StringIO) as output:
            try:
                helper.main()
            except SystemExit:
                pass
            self.assertNotIn('hub_access.test.only', output.getvalue())
        return requests

    def test_default_never_posts(self):
        requests = self.run_helper([], [''])
        self.assertEqual([r.get_method() for r in requests], ['GET', 'GET'])

    def test_send_without_approval_never_posts(self):
        requests = self.run_helper(['--send'], ['', 'YES', 'NO'])
        self.assertTrue(all(r.get_method() == 'GET' for r in requests))

    def test_approved_send_makes_one_fixed_payload_request(self):
        requests = self.run_helper(['--send'], ['', 'YES', 'SEND 0.01 TEST-PI TO verified-admin'])
        posts = [r for r in requests if r.get_method() == 'POST']
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0].data, b'{"uid": "verified-admin"}')


if __name__ == '__main__':
    unittest.main()
