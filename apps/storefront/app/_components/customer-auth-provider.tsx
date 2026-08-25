"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  customerAuthApi,
  type CustomerSession,
} from "../_lib/customer-auth-api";

type CustomerAuthState = {
  loading: boolean;
  refresh(): Promise<void>;
  session: CustomerSession | null;
  signOut(allDevices?: boolean): Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSession(await customerAuthApi.session());
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void customerAuthApi
      .session()
      .then((current) => active && setSession(current))
      .catch(() => active && setSession(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  const value = useMemo<CustomerAuthState>(
    () => ({
      loading,
      refresh,
      session,
      async signOut(allDevices = false) {
        if (allDevices) await customerAuthApi.logoutAll();
        else await customerAuthApi.logout();
        setSession(null);
      },
    }),
    [loading, refresh, session],
  );
  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthState {
  const value = useContext(CustomerAuthContext);
  if (!value) throw new Error("CustomerAuthProvider is required.");
  return value;
}
