'use client'

import React, { useState } from 'react'

import { MintWarrantyPortalToken } from './mint-warranty-portal-token'

interface WarrantyPortalProject {
  id: string
  name: string
}

interface WarrantyPortalLinkIssuerProps {
  projects: WarrantyPortalProject[]
}

export function WarrantyPortalLinkIssuer({ projects }: WarrantyPortalLinkIssuerProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')

  if (projects.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--color-neutral-600)', fontSize: 13 }}>
        No projects are available for warranty portal access.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <p
        style={{
          margin: 0,
          color: 'var(--color-neutral-600)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Select a project, then issue a link for the client to submit and track warranty
        requests.
      </p>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          style={{
            width: '100%',
            minWidth: 0,
            padding: '8px 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'white',
            color: 'var(--color-neutral-900)',
            fontSize: 13,
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <MintWarrantyPortalToken key={projectId} projectId={projectId} label="Issue warranty portal link" />
    </div>
  )
}
