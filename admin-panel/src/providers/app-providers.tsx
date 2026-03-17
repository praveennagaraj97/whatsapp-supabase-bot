'use client';

import { SWRConfig } from 'swr';

import { ToasterProvider } from '@/components/toaster-provider';
import { apiFetcher } from '@/config/axios';

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <ToasterProvider />
      <SWRConfig
        value={{
          fetcher: apiFetcher,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </>
  );
}
