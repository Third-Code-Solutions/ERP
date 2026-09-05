import React from 'react'

/** Readable paragraphs and lists without interpreting provider text as HTML. */
export function CortexMessageContent({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/).filter((block) => block.trim())
  return <div className="cortex-message-content">{blocks.map((block, index) => {
    const lines = block.split('\n').filter((line) => line.trim())
    const bullets = lines.every((line) => /^\s*[-*•]\s+/.test(line))
    return bullets
      ? <ul key={index}>{lines.map((line, item) => <li key={item}>{line.replace(/^\s*[-*•]\s+/, '')}</li>)}</ul>
      : <p key={index}>{block}</p>
  })}</div>
}
