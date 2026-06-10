export type CommandContent = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  body: string;
};

export type ToolCommandAdapter = {
  toolId: string;
  getFilePath: (commandId: string) => string;
  formatFile: (content: CommandContent) => string;
  isGlobalPath?: boolean;
};

export type GeneratedCommand = {
  path: string;
  fileContent: string;
  global: boolean;
};
