'use client'

/**
 * DocumentUploader — drag-and-drop file uploader with 5-state machine.
 *
 * States: idle → uploading (gold progress bar) → scanning (spinner) → complete (checkmark) → error (alert)
 *
 * Accepted: PDF, DOCX, XLSX, PNG, JPG — Max 10 MB
 * Upload calls POST /api/dashboard/documents/upload with multipart FormData.
 */

import * as React from 'react'
import { Loader2, CheckCircle2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export interface UploadedDoc {
  id: string
  file_name: string
  file_size_bytes: number
  created_at: string
}

export interface DocumentUploaderProps {
  onUploadComplete: (doc: UploadedDoc) => void
}

type UploadState = 'idle' | 'uploading' | 'scanning' | 'complete' | 'error'

export function DocumentUploader({ onUploadComplete }: DocumentUploaderProps) {
  const [uploadState, setUploadState] = React.useState<UploadState>('idle')
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [dragOver, setDragOver] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploadState('uploading')
    setUploadProgress(0)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      // POST — do NOT set Content-Type; browser sets multipart boundary automatically
      const res = await fetch('/api/dashboard/documents/upload', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)

      if (res.status === 400) {
        const json = (await res.json()) as { error?: string }
        setUploadState('error')
        setErrorMessage(
          json.error ?? 'Upload failed. Accepted formats: PDF, DOCX, XLSX, PNG, JPG. Maximum size: 10 MB.'
        )
        return
      }

      if (res.status === 422) {
        // Virus scan blocked
        const json = (await res.json()) as { error?: string }
        setUploadState('error')
        setErrorMessage(
          json.error ??
            'This file was blocked by our security scanner. Please verify the file and try uploading again.'
        )
        return
      }

      if (!res.ok) {
        setUploadState('error')
        setErrorMessage(
          'Upload failed. Accepted formats: PDF, DOCX, XLSX, PNG, JPG. Maximum size: 10 MB.'
        )
        return
      }

      // Upload succeeded — parse response immediately while body is fresh
      const doc = (await res.json()) as UploadedDoc

      // Move to scanning state (visual feedback)
      setUploadProgress(100)
      setUploadState('scanning')

      // Simulate scan delay (1.5s)
      await new Promise((r) => setTimeout(r, 1500))

      setUploadState('complete')
      onUploadComplete(doc)
    } catch {
      setUploadState('error')
      setErrorMessage(
        'Upload failed. Accepted formats: PDF, DOCX, XLSX, PNG, JPG. Maximum size: 10 MB.'
      )
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    // Reset input so the same file can be re-selected after an error
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  function handleReset() {
    setUploadState('idle')
    setUploadProgress(0)
    setErrorMessage('')
  }

  return (
    <div className="space-y-3">
      {/* Drag-and-drop zone (shown during idle only) */}
      {uploadState === 'idle' && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Click or drag a file to upload"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          className={cn(
            'min-h-[120px] rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer',
            'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2',
            dragOver
              ? 'border-[#2D5016] bg-[#2D5016]/5'
              : 'border-dashed border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
          )}
        >
          <UploadCloud
            className={cn('h-8 w-8 mb-2', dragOver ? 'text-[#2D5016]' : 'text-gray-400')}
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500 font-body">Drag and drop or click to upload</p>
          <p className="text-xs text-gray-400 font-body mt-1">
            Accepted: PDF, DOCX, XLSX, PNG, JPG — Max 10 MB
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="sr-only"
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
        onChange={handleFileSelect}
        aria-hidden="true"
      />

      {/* Uploading state — progress bar */}
      {uploadState === 'uploading' && (
        <div className="space-y-2 p-4 border border-gray-200 rounded-lg bg-white">
          <p className="text-sm font-body text-gray-700">Uploading…</p>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-2 bg-[#C9A84C] rounded-full transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            />
          </div>
          <p className="text-xs font-body text-gray-400">{uploadProgress}%</p>
        </div>
      )}

      {/* Scanning state */}
      {uploadState === 'scanning' && (
        <div
          role="status"
          className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg bg-white"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[#C9A84C]" aria-hidden="true" />
          <span className="text-sm font-body text-gray-700">Scanning for threats…</span>
        </div>
      )}

      {/* Complete state */}
      {uploadState === 'complete' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 border border-green-200 rounded-lg bg-green-50">
            <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
            <span className="text-sm font-body text-green-700">Upload complete</span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Upload Another File
          </Button>
        </div>
      )}

      {/* Error state */}
      {uploadState === 'error' && (
        <div className="space-y-3">
          <div
            role="alert"
            className="p-4 border border-red-200 rounded-lg bg-red-50"
          >
            <p className="text-sm font-body text-red-600">{errorMessage}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Upload Another File
          </Button>
        </div>
      )}
    </div>
  )
}
