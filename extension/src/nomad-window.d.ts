interface SignedAction {
  agentPublicKey: string;
  signature: string;
  request: { action: string; timestamp: number };
}

interface NomadAPI {
  getPublicKey(): Promise<string | null>;
  signMessage(message: string): Promise<{ agentPublicKey: string; signature: string }>;
  signAction(action: string): Promise<SignedAction>;
}

interface Window {
  nomad: NomadAPI;
}
