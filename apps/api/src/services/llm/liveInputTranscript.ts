type SaveTranscript = (text: string) => Promise<void>;

type LiveServerResponse = {
  serverContent?: {
    inputTranscription?: { text?: string };
    input_transcription?: { text?: string };
  };
};

export class LiveInputTranscriptAccumulator {
  private fragments: string[] = [];
  private flushChain: Promise<void> = Promise.resolve();

  accept(response: LiveServerResponse): void {
    const serverContent = response.serverContent;
    const text = serverContent?.inputTranscription?.text
      ?? serverContent?.input_transcription?.text;

    if (text?.trim()) {
      this.fragments.push(text);
    }
  }

  flush(save: SaveTranscript): Promise<void> {
    const run = async () => {
      const fragmentCount = this.fragments.length;
      if (fragmentCount === 0) return;

      const text = this.fragments.slice(0, fragmentCount).join('').trim();
      if (!text) {
        this.fragments.splice(0, fragmentCount);
        return;
      }

      await save(text);
      this.fragments.splice(0, fragmentCount);
    };

    const result = this.flushChain.then(run, run);
    this.flushChain = result.catch(() => undefined);
    return result;
  }
}

