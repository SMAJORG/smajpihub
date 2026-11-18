import { AuthResult, PaymentDTO } from "./pi";

declare global {
  interface Window {
    __ENV?: {
      apiBaseURL?: string;
      backendURL?: string;
      sandbox?: string;
      soloHost?: string;
      piOAuthClientId?: string;
      piOAuthRedirectUri?: string;
    };
    Pi?: {
      nativeFeaturesList?(): Promise<string[]>;
      Ads?: {
        isAdReady(type: "interstitial"): Promise<{ type: "interstitial"; ready: boolean }>;
        requestAd(type: "interstitial"): Promise<{ type: "interstitial"; result: "AD_LOADED" | "AD_FAILED_TO_LOAD" | "AD_NOT_AVAILABLE" | "ADS_NOT_SUPPORTED" }>;
        showAd(type: "interstitial"): Promise<{ type: "interstitial"; result: "AD_CLOSED" | "AD_DISPLAY_ERROR" | "AD_NETWORK_ERROR" | "AD_NOT_AVAILABLE" | "ADS_NOT_SUPPORTED" }>;
      };
      init(config: { version: string; sandbox: boolean }): void | Promise<void>;
      openShareDialog?(title: string, message: string): void;

      authenticate(scopes: string[], onIncompletePaymentFound?: (payment: PaymentDTO) => void): Promise<AuthResult>;

      createPayment(
        data: {
          amount: number;
          memo: string;
          metadata: Record<string, unknown>;
        },
        callbacks: {
          onReadyForServerApproval: (paymentId: string) => void;
          onReadyForServerCompletion: (paymentId: string, txid: string) => void;
          onCancel: (paymentId: string) => void;
          onError: (error: Error, payment?: PaymentDTO) => void;
        }
      ): Promise<unknown>;
    };
  }
}
