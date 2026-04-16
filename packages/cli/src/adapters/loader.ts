export class TranscriptAdapterRegistry {
  private readonly adapters = new Map<FrontendId, TranscriptAdapter>();

  register = (adapter: TranscriptAdapter): void => {
    this.adapters.set(adapter.frontendId, adapter);
  };

  listAdapters = (): TranscriptAdapter[] => [...this.adapters.values()];

  getAdapter = (frontendId: FrontendId): TranscriptAdapter => {
    const adapter = this.adapters.get(frontendId);

    if (!adapter) {
      throw new Error(`No transcript adapter registered for frontend: ${frontendId}`);
    }

    return adapter;
  };

  loadSession = async (
    session: SessionReference,
  ): Promise<NormalizedSessionBundle> =>
    this.getAdapter(session.frontendId).loadSession(session);
}

export const createTranscriptAdapterRegistry = (): TranscriptAdapterRegistry =>
  new TranscriptAdapterRegistry();

