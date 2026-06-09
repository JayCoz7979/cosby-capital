'use client'

/**
 * ConfirmDialog — Radix Dialog for destructive action confirmation.
 *
 * Accessibility requirements (UI-SPEC):
 *   - Focus trapped within dialog (Radix provides this automatically)
 *   - ESC closes dialog (Radix provides this by default)
 *   - Confirm button is NOT auto-focused (prevents accidental activation)
 *   - Cancel button renders first and receives initial focus (safer default)
 */

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: 'destructive' | 'default'
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Content */}
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md rounded-lg bg-white p-6 shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          <div className="mb-4">
            <Dialog.Title className="text-[20px] font-semibold font-heading text-gray-900">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-body text-gray-600">
              {body}
            </Dialog.Description>
          </div>

          {/* Footer — Cancel first (receives focus), Confirm second */}
          <div className="flex justify-end gap-3 mt-6">
            {/* Cancel — tabIndex=0, receives initial focus (safer default) */}
            <Button
              variant="secondary"
              tabIndex={0}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>

            {/* Confirm — tabIndex=1, NOT auto-focused (WCAG / UI-SPEC requirement) */}
            {variant === 'destructive' ? (
              <button
                tabIndex={1}
                onClick={() => {
                  onConfirm()
                  onOpenChange(false)
                }}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium font-body',
                  'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
                  'transition-colors duration-150 focus:outline-none',
                  'focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-60'
                )}
              >
                {confirmLabel}
              </button>
            ) : (
              <Button
                variant="primary"
                tabIndex={1}
                onClick={() => {
                  onConfirm()
                  onOpenChange(false)
                }}
              >
                {confirmLabel}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
