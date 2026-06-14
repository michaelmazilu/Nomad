interface NomadAPI {
  getPublicKey(): Promise<string | null>;
  signMessage(message: string): Promise<{ agentPublicKey: string; signature: string }>;
}

interface Window {
  nomad: NomadAPI;
}
