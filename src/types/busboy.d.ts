declare module "busboy" {
  import type { Writable } from "stream";

  type BusboyConfig = {
    headers: Record<string, string | string[] | undefined>;
    limits?: { fileSize?: number; files?: number; fields?: number };
  };

  type BusboyFileInfo = {
    filename: string;
    encoding: string;
    mimeType: string;
  };

  interface Busboy extends NodeJS.EventEmitter {
    on(event: "field", listener: (name: string, val: string) => void): this;
    on(
      event: "file",
      listener: (name: string, file: NodeJS.ReadableStream, info: BusboyFileInfo) => void
    ): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "finish" | "close", listener: () => void): this;
    end(chunk?: unknown): void;
  }

  function busboy(config: BusboyConfig): Busboy;
  export = busboy;
}
