const FILE = /^[a-z0-9-]+\.(mp3|json)$/;

const TYPES = {
  mp3: "audio/mpeg",
  json: "application/json"
} satisfies Record<string, string>;

export type AudioExtension = keyof typeof TYPES;

const isAudioExtension = (extension: string): extension is AudioExtension => extension in TYPES;

/** The file's extension when the name is one the audio build writes, else undefined. */
export function audioExtension(file: string): AudioExtension | undefined {
  const extension = FILE.exec(file)?.[1];
  return extension && isAudioExtension(extension) ? extension : undefined;
}

export const defaultContentType = (extension: AudioExtension): string => TYPES[extension];
