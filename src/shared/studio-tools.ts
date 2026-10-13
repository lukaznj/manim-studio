// The tools Claude uses to make a video in Studio, defined once for two callers:
// - the in-app chat (Agent SDK, in-process; the scene tools only, it edits files itself)
// - Claude Desktop, through the extension in mcpb/ and the app's local endpoint (src/main/mcp.ts)
// Handlers live in the main process; this file holds only names, descriptions and inputs.
import { z } from 'zod'

export const sceneTools = {
  render_preview: {
    description:
      'Render the low-resolution preview of scene.py and report what happened: duration, sections, layout warnings (things off screen, overlapping text), voice problems, or the error with its scene.py line. Call it after every change to scene.py.',
    shape: {},
  },
  get_timeline: {
    description:
      'The current timeline from the last successful render: sections, every play()/wait() clip with its scene.py line and times, voiceover blocks with their text and audio source, subtitles and layout warnings.',
    shape: {},
  },
  view_frames: {
    description:
      'Look at frames of the latest preview render at the given times (seconds). Use it to check layout, legibility and that things look right — after every visual change. Up to 6 times per call.',
    shape: { times: z.array(z.number()).min(1).max(6) },
  },
  read_source: {
    description:
      'Read the text of a PDF the user added as a source (sources/), page by page, each page after a "=== Page N ===" line. Read a long PDF in parts with from_page/to_page. Pages without a text layer (scans, pictures) are named; look at those with view_source_pages.',
    shape: {
      source: z.string().describe('The PDF’s file name in sources/, e.g. "worksheet.pdf"'),
      from_page: z.number().int().min(1).optional().describe('First page, 1-based (default 1)'),
      to_page: z.number().int().min(1).optional().describe('Last page, inclusive (default: the last)'),
    },
  },
  view_source_pages: {
    description:
      'Look at pages of a source PDF as pictures: figures, tables, graphs, handwriting, scanned pages, and where things are on the page (for pdf_page crops). Up to 4 pages per call.',
    shape: {
      source: z.string().describe('The PDF’s file name in sources/'),
      pages: z.array(z.number().int().min(1)).min(1).max(4).describe('Page numbers, 1-based'),
    },
  },
}

export const desktopTools = {
  list_projects: {
    description: 'List the video projects in Manim Studio: title, format, length, when it last changed and its folder.',
    shape: {},
  },
  create_project: {
    description:
      'Create a new video project and open it in Manim Studio (the app starts if it isn’t running). Returns the guide for writing its scene: read it before writing scene.py. The format can’t be changed later.',
    shape: {
      title: z.string().min(1).describe('The video’s title, e.g. "The vertex of a parabola"'),
      format: z.enum(['16:9', '9:16']).describe('16:9 for screens, projectors and YouTube; 9:16 for phones, full screen'),
      theme: z.enum(['dark', 'light']).optional().describe('The video’s colour theme (default dark)'),
      language: z.string().optional().describe('Narration language as an ISO 639-1 code, e.g. "en", "hr", "de" (default: the app’s setting)'),
    },
  },
  open_project: {
    description: 'Open an existing project in Manim Studio by its title or folder. Returns the guide for writing its scene and the current scene.py.',
    shape: { project: z.string().describe('The project’s title (as list_projects shows it) or its folder path') },
  },
  get_scene: {
    description: 'The open project’s scene.py.',
    shape: {},
  },
  write_scene: {
    description: 'Replace the open project’s scene.py with new source. The app’s editor shows it right away. Then call render_preview.',
    shape: { source: z.string().describe('The complete new scene.py') },
  },
  edit_scene: {
    description: 'Replace one exact passage of scene.py (it must occur exactly once). Cheaper than write_scene for small changes. Then call render_preview.',
    shape: {
      old_text: z.string().min(1).describe('The exact text to replace, including indentation'),
      new_text: z.string().describe('What to put in its place'),
    },
  },
  ...sceneTools,
  export_video: {
    description:
      'Export the finished video: a 1080p mp4, .vtt and .srt subtitles and a thumbnail, in the project’s exports folder. It takes a few minutes; the first call starts it, later calls report progress and then the files.',
    shape: {},
  },
}

export type DesktopToolName = keyof typeof desktopTools

/** What Claude Desktop is told about the server as a whole. */
export const desktopInstructions = [
  'Manim Studio is a desktop app that makes short maths explainer videos from manim code, with narration, subtitles and a timeline.',
  'When the user asks for a maths, explainer or manim video: create_project (or open_project), read the guide it returns, write scene.py, then render_preview and view_frames until it looks right. Fix every error and layout warning before you call it done.',
  'The app opens and shows the video, its code and its timeline while you work. Tell the user it is there: they can watch it, retime clips, record their own narration and export (or ask you to call export_video).',
].join('\n')
