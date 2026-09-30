'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as dataSource from './data-source';
import { groupNotesByTab, type CaseChatTab } from '@/modules/helios/notes.api';
import { formatLogDate } from '@/modules/helios/logs.api';
import { toControlTowerCases } from './domain/case';

export const queryKeys = {
  cases: (branch: string | null, division: string) => ['control-tower', 'cases', branch, division] as const,
  notes: (serviceId: string | null) => ['control-tower', 'notes', serviceId] as const,
  logs: (serviceId: string | null) => ['control-tower', 'logs', serviceId] as const,
  incomingCall: (callUniqueId: string | null) => ['control-tower', 'incoming-call', callUniqueId] as const,
};

/** Cola del Control Tower: servicios reales mapeados a casos. */
export const useCasesQuery = (input: { branch: string | null; division: string }) =>
  useQuery({
    queryKey: queryKeys.cases(input.branch, input.division),
    queryFn: async () => {
      const result = await dataSource.loadCases({ branch: input.branch, division: input.division });
      return {
        ...result,
        cases: toControlTowerCases(result.services),
        /** Servicios que quedaron fuera del alcance (p.ej. trip.status = new). */
        outOfScopeCount: result.services.length - toControlTowerCases(result.services).length,
      };
    },
  });

export const useNotesQuery = (serviceId: string | null) =>
  useQuery({
    queryKey: queryKeys.notes(serviceId),
    queryFn: async () => {
      if (!serviceId) return { all: [], byTab: { driver: [], account: [], internal: [] } };
      const all = await dataSource.loadNotes(serviceId);
      const byTab = groupNotesByTab(all);
      return { all, byTab };
    },
    enabled: Boolean(serviceId),
    refetchInterval: 30_000,
    // Preserve optimistic observations across refetches since gNotes doesn't return them
    structuralSharing: (oldData: any, newData: any) => {
      if (!oldData || !newData) return newData;
      const oldInternal = oldData.byTab?.internal ?? [];
      const newInternal = newData.byTab?.internal ?? [];
      // Keep optimistic internal notes that aren't in the server response
      const optimisticNotes = oldInternal.filter(
        (note: any) => note._id?.startsWith?.('local-') && !newInternal.some((n: any) => n._id === note._id)
      );
      if (optimisticNotes.length === 0) return newData;
      return {
        ...newData,
        byTab: {
          ...newData.byTab,
          internal: [...newData.byTab.internal, ...optimisticNotes],
        },
      };
    },
  });

export const useServiceLogsQuery = (serviceId: string | null) =>
  useQuery({
    queryKey: queryKeys.logs(serviceId),
    queryFn: async () => {
      if (!serviceId) return [];
      return dataSource.loadServiceLogs(serviceId);
    },
    enabled: Boolean(serviceId),
    staleTime: 30_000,
  });

// Re-export formatLogDate so the modal doesn't need to import from logs.api
export { formatLogDate };

export const useIncomingCallQuery = (callUniqueId: string | null) =>
  useQuery({
    queryKey: queryKeys.incomingCall(callUniqueId),
    queryFn: () => (callUniqueId ? dataSource.loadIncomingCall(callUniqueId) : null),
    enabled: Boolean(callUniqueId),
    // Mismo intervalo que usa nextjs_helios_dispatch para incoming-calls.
    refetchInterval: 30_000,
    retry: 3,
  });

export const useAddNoteMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { msg: string; tab: CaseChatTab }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.addNote({ serviceId, msg: input.msg, tab: input.tab });
      return input;
    },
    onSuccess: (input) => {
      const newNote = {
        _id: `local-${Date.now()}`,
        serviceId,
        msg: input.msg,
        date: new Date().toISOString(),
        user: { type: 'user' },
        chatType: 'driver',
        isObservation: input.tab === 'internal',
        readFromHelios: true,
      };
      queryClient.setQueryData(queryKeys.notes(serviceId), (old: any) => {
        if (!old) {
          return {
            all: [newNote],
            byTab: { driver: input.tab === 'driver' ? [newNote] : [], account: input.tab === 'account' ? [newNote] : [], internal: input.tab === 'internal' ? [newNote] : [] },
          };
        }
        const tab = input.tab;
        return {
          all: [...old.all, newNote],
          byTab: {
            ...old.byTab,
            [tab]: [...(old.byTab[tab] ?? []), newNote],
          },
        };
      });
      if (input.tab !== 'internal') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notes(serviceId) });
      }
    },
  });
};

export const useCreateCheckInMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      checkInDate: string;
      reason: string;
      branch?: string;
      serviceStatus?: string;
    }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.createCheckIn({ serviceId, ...input });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useResolveCheckInMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: string }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.resolveCheckIn({ serviceId, reason: input.reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useLinkCallMutation = () =>
  useMutation({
    mutationFn: (input: { callUniqueId: string; serviceId: string }) =>
      dataSource.linkCallToService(input.callUniqueId, input.serviceId),
  });

export const useDelayServiceMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { time: number }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.delayServiceMonitor({ serviceId, time: input.time });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useAdvanceTripMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: string }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.advanceTripStatus({ serviceId, status: input.status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useAuditHoldMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (isAuditHold: boolean) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.setAuditHold(serviceId, isAuditHold);
      return isAuditHold;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useFinishServiceMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.finishActiveService(serviceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useResolveServiceMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      await dataSource.resolveService(serviceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};

export const useMarkSurveyReviewedMutation = (serviceId: string | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentObservations?: string }) => {
      if (!serviceId) throw new Error('No hay caso abierto.');
      return dataSource.markSurveyReviewed({ serviceId, ...input });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control-tower', 'cases'] });
    },
  });
};
