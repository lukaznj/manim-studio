import { FolderOpen, ImagePlus, Plus, Sparkles, SquarePlay, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MediaItem } from '../../../shared/types'
import { api } from '../lib/api'
import { editorBridge } from '../lib/editor-bridge'
import { revealLabel } from '../lib/platform'
import { errorText, toast, useStore } from '../store'

/** A Python name for the file: "class-photo-2.png" → class_photo_2. */
const variable = (name: string) => {
  const v = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return /^[0-9]/.test(v) || !v ? `media_${v}` : v
}

/** What "Insert" puts below the cursor in scene.py. */
const snippet = (item: MediaItem): string[] => {
  const v = variable(item.name)
  return item.kind === 'image'
    ? [`${v} = image("${item.name}")`, `self.play(FadeIn(${v}), run_time=0.6)`]
    : [`${v} = VideoClip("${item.name}")`, `self.play(FadeIn(${v}), run_time=0.4)`, `${v}.start()`, `self.wait(${v}.duration)`]
}

const size = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`)

/** The project's own pictures and videos (media/): drop or add them, then insert them or ask Claude to use them. */
export function MediaPane() {
  const project = useStore((s) => s.project)
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void api.listMedia().then(setItems)
  }, [project?.path])

  const add = async (paths: string[]) => {
    try {
      const before = items?.length ?? 0
      const next = await api.importMedia(paths)
      setItems(next)
      const added = next.length - before
      if (added > 0) toast(added === 1 ? 'Added 1 file to media/' : `Added ${added} files to media/`, 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
      setItems(await api.listMedia())
    }
  }

  const insert = (item: MediaItem) => {
    useStore.setState({ leftTab: 'code' })
    requestAnimationFrame(() => editorBridge.insertLines(snippet(item)) || toast('Click in scene.py where it should go, then try again.', 'info'))
  }

  const remove = async (item: MediaItem) => {
    if (!confirm(`Move “${item.name}” to the Trash? A scene that uses it won’t render until you put it back.`)) return
    setItems(await api.removeMedia(item.name))
  }

  return (
    <div
      className={`media-pane ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void add([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
      }}
    >
      {items && items.length === 0 ? (
        <div className="media-empty">
          <ImagePlus />
          <p>
            <strong>Your pictures and videos</strong>
            <br />
            <span className="muted">Drop them here or add them. Insert one into the scene, or ask Claude to use it.</span>
          </p>
          <button className="btn" onClick={() => void add([])}>
            <Plus /> Add pictures and videos
          </button>
        </div>
      ) : (
        <div className="media-grid">
          {items?.map((item) => (
            <div key={item.name} className="media-card">
              <div className="media-thumb">
                {item.thumb ? <img src={api.mediaUrl(item.thumb)} alt="" /> : <SquarePlay />}
                {item.kind === 'video' && <span className="media-kind">video</span>}
              </div>
              <div className="media-meta">
                <span className="media-name mono" title={item.name}>
                  {item.name}
                </span>
                <span className="faint">{size(item.size)}</span>
              </div>
              <div className="media-actions">
                <button className="btn small" onClick={() => insert(item)} title="Put it into scene.py below the cursor">
                  <Plus /> Insert
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => useStore.setState({ chatDraft: `Use media/${item.name} in the video: ` })}
                  title="Ask Claude to use it"
                >
                  <Sparkles /> Ask Claude
                </button>
                <button className="icon-btn" onClick={() => project && void api.reveal(`${project.path}/media/${item.name}`)} title={revealLabel}>
                  <FolderOpen />
                </button>
                <button className="icon-btn" onClick={() => void remove(item)} title="Move to the Trash">
                  <Trash2 />
                </button>
              </div>
            </div>
          ))}
          <button className="media-add" onClick={() => void add([])}>
            <Plus /> Add
          </button>
        </div>
      )}
      {dragging && <div className="media-drop">Drop to add to media/</div>}
    </div>
  )
}
