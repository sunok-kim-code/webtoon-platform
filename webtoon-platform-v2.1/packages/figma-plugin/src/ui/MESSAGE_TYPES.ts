// ============================================================
// Plugin UI Message Types & Interfaces
// Reference guide for plugin main thread (src/code.ts)
// ============================================================

/**
 * All messages between UI (iframe) and plugin main thread (code.ts)
 * Communication via postMessage with pluginMessage wrapper
 */

// ============================================================
// IMPORT PANEL MESSAGES
// ============================================================

export interface GetProjectsMessage {
  type: "GET_PROJECTS";
}

export interface ProjectsListMessage {
  type: "PROJECTS_LIST";
  payload: {
    projects: Array<{
      id: string;
      name: string;
    }>;
  };
}

export interface GetEpisodesMessage {
  type: "GET_EPISODES";
  payload: {
    projectId: string;
  };
}

export interface EpisodesListMessage {
  type: "EPISODES_LIST";
  payload: {
    episodes: Array<{
      id: string;
      episodeNum: number;
      title: string;
    }>;
    panelCount: number;
  };
}

export interface ImportEpisodeMessage {
  type: "IMPORT_EPISODE";
  payload: {
    projectId: string;
    episodeId: string;
  };
}

// ============================================================
// BUBBLE PANEL MESSAGES
// ============================================================

export interface GetCharactersMessage {
  type: "GET_CHARACTERS";
}

export interface CharactersListMessage {
  type: "CHARACTERS_LIST";
  payload: {
    characters: Array<{
      id: string;
      name: string;
      color?: string;
    }>;
  };
}

export interface SelectCharacterMessage {
  type: "SELECT_CHARACTER";
  payload: {
    characterId: string;
  };
}

export interface CharacterSelectedMessage {
  type: "CHARACTER_SELECTED";
  payload: {
    characterId: string;
    color: string;
  };
}

export type BubbleStyleName =
  | "speech"
  | "speechWide"
  | "speechFlat"
  | "speechRound"
  | "shout"
  | "gourd"
  | "thought"
  | "cloud"
  | "box"
  | "wave"
  | "concentration"
  | "narration"
  | "whisper"
  | "text"
  | "textCircle";

export interface AddBubbleMessage {
  type: "ADD_BUBBLE";
  payload: {
    type: BubbleStyleName;
    text: string;
    characterId?: string | null;
    characterColor?: string;
  };
}

export interface BubbleAddedMessage {
  type: "BUBBLE_ADDED";
  payload: {
    nodeId: string;
    type: BubbleStyleName;
    text: string;
  };
}

// ============================================================
// SFX PANEL MESSAGES
// ============================================================

export interface AddSFXMessage {
  type: "ADD_SFX";
  payload: {
    text: string;
    timestamp: number;
  };
}

export interface SFXAddedMessage {
  type: "SFX_ADDED";
  payload: {
    nodeId: string;
    text: string;
  };
}

// ============================================================
// LAYOUT PANEL MESSAGES
// ============================================================

export type LayoutPreset =
  | "vertical_strip"
  | "two_column"
  | "three_row"
  | "wide_top"
  | "cinematic";

export interface ApplyLayoutMessage {
  type: "APPLY_LAYOUT";
  payload: {
    preset: LayoutPreset;
    gutter: number; // pixels
    stripWidth: number; // pixels
  };
}

export interface LayoutAppliedMessage {
  type: "LAYOUT_APPLIED";
  payload: {
    preset: LayoutPreset;
    gutter: number;
    stripWidth: number;
  };
}

// ============================================================
// EXPORT & SYNC MESSAGES
// ============================================================

export interface ExportSyncMessage {
  type: "EXPORT_SYNC";
  payload: {
    timestamp: number;
  };
}

export interface ExportStartMessage {
  type: "EXPORT_START";
  payload?: {
    timestamp: number;
  };
}

export interface ExportOkMessage {
  type: "EXPORT_OK";
  payload?: {
    nodeCount: number;
    timestamp: number;
  };
}

export interface ExportErrorMessage {
  type: "EXPORT_ERROR";
  payload: {
    error: string;
  };
}

export interface SyncOkMessage {
  type: "SYNC_OK";
  payload?: {
    id: string;
    figmaNodeId: string;
  };
}

export interface SyncErrorMessage {
  type: "SYNC_ERROR";
  payload: {
    id: string;
    error: string;
  };
}

// ============================================================
// PROGRESS & STATUS MESSAGES
// ============================================================

export interface ProgressMessage {
  type: "PROGRESS";
  payload: {
    current: number;
    total: number;
    label: string;
  };
}

export interface BatchOkMessage {
  type: "BATCH_OK";
  payload?: {
    count: number;
  };
}

export interface StatusMessage {
  type: "STATUS";
  payload: {
    pageCount: number;
    connected: boolean;
  };
}

// ============================================================
// INITIALIZATION MESSAGES
// ============================================================

export interface InitMessage {
  type: "INIT";
}

export interface PingMessage {
  type: "PING";
}

export interface PongMessage {
  type: "PONG";
}

// ============================================================
// UNION TYPE FOR ALL POSSIBLE MESSAGES
// ============================================================

export type PluginMessage =
  // Import
  | GetProjectsMessage
  | ProjectsListMessage
  | GetEpisodesMessage
  | EpisodesListMessage
  | ImportEpisodeMessage
  // Bubble
  | GetCharactersMessage
  | CharactersListMessage
  | SelectCharacterMessage
  | CharacterSelectedMessage
  | AddBubbleMessage
  | BubbleAddedMessage
  // SFX
  | AddSFXMessage
  | SFXAddedMessage
  // Layout
  | ApplyLayoutMessage
  | LayoutAppliedMessage
  // Export & Sync
  | ExportSyncMessage
  | ExportStartMessage
  | ExportOkMessage
  | ExportErrorMessage
  | SyncOkMessage
  | SyncErrorMessage
  // Progress & Status
  | ProgressMessage
  | BatchOkMessage
  | StatusMessage
  // Init
  | InitMessage
  | PingMessage
  | PongMessage;

// ============================================================
// HELPER TYPE GUARDS
// ============================================================

export function isFromUI(
  msg: any
): msg is { type: string; payload?: any } {
  return msg && typeof msg.type === "string";
}

export function isFromPlugin(
  msg: any
): msg is { type: string; payload?: any } {
  return msg && typeof msg.type === "string";
}

// ============================================================
// EXAMPLE: Plugin Main Thread Message Handler
// ============================================================

/**
 * Example handler in src/code.ts:
 *
 * figma.ui.onmessage = async (msg: any) => {
 *   const pluginMsg = msg as PluginMessage;
 *
 *   switch (pluginMsg.type) {
 *     case "GET_PROJECTS":
 *       const projects = await fetchProjectsFromFirebase();
 *       figma.ui.postMessage({
 *         type: "PROJECTS_LIST",
 *         payload: { projects }
 *       });
 *       break;
 *
 *     case "GET_EPISODES":
 *       const { projectId } = (pluginMsg as GetEpisodesMessage).payload;
 *       const episodes = await fetchEpisodesFromFirebase(projectId);
 *       figma.ui.postMessage({
 *         type: "EPISODES_LIST",
 *         payload: { episodes, panelCount: episodes.length * 3 }
 *       });
 *       break;
 *
 *     case "ADD_BUBBLE":
 *       const { type, text, characterId } = (pluginMsg as AddBubbleMessage).payload;
 *       const nodeId = await createBubbleInFigma(type, text, characterId);
 *       figma.ui.postMessage({
 *         type: "BUBBLE_ADDED",
 *         payload: { nodeId, type, text }
 *       });
 *       break;
 *
 *     case "EXPORT_SYNC":
 *       figma.ui.postMessage({ type: "EXPORT_START" });
 *       const data = await exportFigmaToJSON();
 *       await syncToWebtoonsAPI(data);
 *       figma.ui.postMessage({ type: "EXPORT_OK", payload: { nodeCount: data.length } });
 *       break;
 *
 *     // ... handle other message types
 *   }
 * };
 */

// ============================================================
// EXAMPLE: UI Message Sending
// ============================================================

/**
 * Example in React component:
 *
 * function MyComponent({ onMessage }) {
 *   const handleClick = () => {
 *     const msg: AddBubbleMessage = {
 *       type: "ADD_BUBBLE",
 *       payload: {
 *         type: "speech",
 *         text: "Hello!",
 *         characterId: "char_123",
 *         characterColor: "#ff0000"
 *       }
 *     };
 *     parent.postMessage({ pluginMessage: msg }, "*");
 *   };
 *
 *   return <button onClick={handleClick}>Add Bubble</button>;
 * }
 */
