/**
 * ApprovalStatusPill — pill badge for approval workflow states.
 *
 * Communicates status via text label AND color (WCAG requirement — never color alone).
 * Four states: pending | approved | rejected | in_progress
 *
 * No 'use client' — safe to render in server components and client components alike.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'in_progress'

interface ApprovalStatusPillProps {
  status: ApprovalStatus
}

const STATUS_MAP: Record<
  ApprovalStatus,
  { label: string; className: string }
> = {
  pending: {
    label: 'Pending Review',
    className: 'text-amber-700 bg-amber-50 border border-amber-200',
  },
  approved: {
    label: 'Approved',
    className: 'text-green-700 bg-green-50 border border-green-200',
  },
  rejected: {
    label: 'Not Approved',
    className: 'text-red-600 bg-red-50 border border-red-200',
  },
  in_progress: {
    label: 'In Progress',
    className: 'text-blue-600 bg-blue-50 border border-blue-200',
  },
}

export function ApprovalStatusPill({ status }: ApprovalStatusPillProps) {
  const { label, className } = STATUS_MAP[status]

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-body ${className}`}
    >
      {label}
    </span>
  )
}
