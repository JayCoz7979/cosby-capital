/**
 * EmptyState — centered placeholder with heading, body, and optional CTA.
 *
 * Used throughout the dashboard when a collection has no items.
 * No 'use client' — renders as a server component.
 */

import * as React from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface EmptyStateCTA {
  label: string
  href?: string
  onClick?: () => void
}

export interface EmptyStateProps {
  heading: string
  body: string
  cta?: EmptyStateCTA
}

export function EmptyState({ heading, body, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Illustration placeholder */}
      <Inbox
        className="h-12 w-12 text-gray-300 mx-auto mb-4"
        aria-hidden="true"
      />

      {/* Heading */}
      <h2 className="text-[20px] font-semibold font-heading text-gray-700 mb-2">
        {heading}
      </h2>

      {/* Body */}
      <p className="text-sm font-body text-gray-500 max-w-sm mx-auto mb-6">
        {body}
      </p>

      {/* CTA */}
      {cta && (
        <>
          {cta.href ? (
            <Link href={cta.href}>
              <Button variant="primary">{cta.label}</Button>
            </Link>
          ) : (
            <Button variant="primary" onClick={cta.onClick}>
              {cta.label}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
