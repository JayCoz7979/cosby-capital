'use client'

/**
 * ApprovalsPageClient — interactive approval queue for agent-generated emails.
 *
 * Approve or reject items via PATCH /api/dashboard/approvals.
 * Items are removed from the list on success (they are no longer pending).
 * processingId prevents double-clicks.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'

export interface ApprovalItem {
  id: string
  agent_name: string
  email_type: string
  to_name: string | null
  to_email: string
  subject: string | null
  body_html: string | null
  created_at: string
  client_approved: boolean
  requires_admin_approval: boolean
}

interface ApprovalsPageClientProps {
  initialApprovals: ApprovalItem[]
}

export function ApprovalsPageClient({ initialApprovals }: ApprovalsPageClientProps) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals)
  const [processingId, setProcessingId] = useState<string | null>(null)

  async function handleAction(id: string, action: 'approve' | 'reject') {
    if (processingId) return
    setProcessingId(id)

    try {
      const res = await fetch('/api/dashboard/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })

      if (res.ok) {
        // Item is no longer pending — remove from list
        setApprovals((prev) => prev.filter((item) => item.id !== id))
      }
    } finally {
      setProcessingId(null)
    }
  }

  if (approvals.length === 0) {
    return (
      <EmptyState
        heading="No Pending Approvals"
        body="Items requiring your review will appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      {approvals.map((item) => {
        const preview = item.body_html?.replace(/<[^>]+>/g, '').slice(0, 200) ?? ''
        const dateLabel = new Date(item.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

        return (
          <Card key={item.id}>
            <CardHeader>
              {/* Subject */}
              <p className="font-heading text-[20px] font-semibold text-gray-900">
                {item.subject ?? '(No subject)'}
              </p>

              {/* Agent + email type row */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 font-body">
                  From: {item.agent_name}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-body">
                  {item.email_type}
                </span>
              </div>
            </CardHeader>

            <CardContent>
              {/* Recipient */}
              <p className="text-sm font-body text-gray-600">
                To: {item.to_name ? `${item.to_name} (${item.to_email})` : item.to_email}
              </p>

              {/* Body preview */}
              {preview && (
                <p className="text-sm font-body text-gray-600 mt-2">
                  {preview}&hellip;
                </p>
              )}

              {/* Date */}
              <p className="text-xs text-gray-400 font-body mt-3">{dateLabel}</p>

              {/* Action buttons */}
              <div className="flex gap-3 mt-4">
                <Button
                  variant="primary"
                  size="sm"
                  loading={processingId === item.id}
                  onClick={() => handleAction(item.id, 'approve')}
                  disabled={processingId !== null && processingId !== item.id}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  loading={processingId === item.id}
                  onClick={() => handleAction(item.id, 'reject')}
                  disabled={processingId !== null && processingId !== item.id}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
