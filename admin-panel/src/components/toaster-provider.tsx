'use client';

import { Toaster } from 'sonner';

export function ToasterProvider() {
  return (
    <Toaster theme="light" position="top-right" expand richColors closeButton />
  );
}
