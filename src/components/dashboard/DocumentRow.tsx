'use client'

/**
 * DocumentRow — table row for a single document with download and delete actions.
 *
 * Download: calls GET /api/dashboard/documents/download/[id] → receives signed URL → triggers browser download
 * Delete: opens ConfirmDialog → calls DELETE /api/dashboard/documents/[id] on confirm
 *
 * Accessibility:
 *   - aria-label on icon-only / action buttons (UI-SPEC)
 *   - ConfirmDialog: ESC closes, confirm NOT auto-focused, cancel first
 */

import * as React from 'react'
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export interface DocumentDoc {
  id: string
  file_name: string
  document_type: string
  document_category?: string
  file_size_bytes: number
  created_at: string
}

export interface DocumentRowProps {
  doc: DocumentDoc
  onDeleted: (id: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') {
    return <FileSpreadsheet className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    return <ImageIcon className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
  }
  // pdf, docx, doc — default to FileText
  return <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
}

export function DocumentRow({ doc, onDeleted }: DocumentRowProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/dashboard/documents/download/${doc.id}`)
      if (!res.ok) {
        console.error('Download failed', res.status)
        return
      }
      const { url } = (await res.json()) as { url: string }
      // Trigger browser download via anchor element
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('Download error', err)
    } finally {
      setDownloading(false)
    }
  }

  async function handleConfirmDelete() {
    try {
      const res = await fetch(`/api/dashboard/documents/${doc.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        onDeleted(doc.id)
      }
    } catch (err) {
      console.error('Delete error', err)
    }
  }

  const typeLabel = doc.document_category ?? doc.document_type

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        {/* File name with icon */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {getFileIcon(doc.file_name)}
            <span className="text-sm font-body text-gray-900 truncate max-w-[200px]" title={doc.file_name}>
              {doc.file_name}
            </span>
          </div>
        </td>

        {/* Type */}
        <td className="px-4 py-3 text-sm text-gray-500 font-body capitalize">
          {typeLabel.replace(/_/g, ' ')}
        </td>

        {/* Size */}
        <td className="px-4 py-3 text-sm text-gray-500 font-body">
          {formatFileSize(doc.file_size_bytes)}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Download ${doc.file_name}`}
              onClick={handleDownload}
              loading={downloading}
              disabled={downloading}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${doc.file_name}`}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </td>
      </tr>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete File?"
        body="This action cannot be undone. The file will be permanently removed."
        confirmLabel="Yes, Delete File"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
