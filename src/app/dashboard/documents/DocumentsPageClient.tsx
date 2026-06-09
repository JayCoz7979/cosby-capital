'use client'

/**
 * DocumentsPageClient — client-side state wrapper for the documents page.
 *
 * Receives initial documents from the server component and manages:
 *   - Adding new docs when DocumentUploader completes
 *   - Removing docs when DocumentRow triggers onDeleted
 *   - Scrolling to the uploader when EmptyState CTA is clicked
 */

import * as React from 'react'
import { DocumentUploader, type UploadedDoc } from '@/components/dashboard/DocumentUploader'
import { DocumentRow, type DocumentDoc } from '@/components/dashboard/DocumentRow'
import { EmptyState } from '@/components/ui/EmptyState'

export interface DocumentsPageClientProps {
  initialDocs: DocumentDoc[]
}

export function DocumentsPageClient({ initialDocs }: DocumentsPageClientProps) {
  const [docs, setDocs] = React.useState<DocumentDoc[]>(initialDocs)
  const uploaderRef = React.useRef<HTMLDivElement>(null)

  function handleUploadComplete(uploaded: UploadedDoc) {
    const newDoc: DocumentDoc = {
      id: uploaded.id,
      file_name: uploaded.file_name,
      document_type: 'user_upload',
      document_category: 'other',
      file_size_bytes: uploaded.file_size_bytes,
      created_at: uploaded.created_at,
    }
    // Prepend — newest first
    setDocs((prev) => [newDoc, ...prev])
  }

  function handleDeleted(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  function scrollToUploader() {
    uploaderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="space-y-6">
      {/* Uploader section */}
      <div ref={uploaderRef} className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
        <h2 className="text-[20px] font-semibold font-heading text-gray-900 mb-4">
          Upload Document
        </h2>
        <DocumentUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Documents table or empty state */}
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
        {docs.length === 0 ? (
          <EmptyState
            heading="No Documents Uploaded"
            body="Upload financial statements, business plans, or other supporting materials."
            cta={{ label: 'Upload Document', onClick: scrollToUploader }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-gray-500 font-body uppercase tracking-wide"
                  >
                    File Name
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-gray-500 font-body uppercase tracking-wide"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-gray-500 font-body uppercase tracking-wide"
                  >
                    Size
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-gray-500 font-body uppercase tracking-wide"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onDeleted={handleDeleted} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
