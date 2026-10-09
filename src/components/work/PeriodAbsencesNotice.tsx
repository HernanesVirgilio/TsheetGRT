import React from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listApprovedAbsences } from '../../services/work/absenceService';
import { Alert } from '../ui/Alert';
import { formatDate } from '../../utils/format';

interface PeriodAbsencesNoticeProps {
  employeeId: string;
  from: string;
  to: string;
}

/**
 * Ausências aprovadas num período de timesheet: dias sem registo passam a ter contexto
 * ("ausência aprovada") em vez de parecerem horas em falta. A leitura respeita a RLS.
 */
export const PeriodAbsencesNotice: React.FC<PeriodAbsencesNoticeProps> = ({ employeeId, from, to }) => {
  const absences = useAsyncData(() => listApprovedAbsences(employeeId, from, to), [employeeId, from, to]);
  if (!absences.data || absences.data.length === 0) return null;
  return (
    <Alert variant="info" title="Ausências aprovadas neste período">
      {absences.data
        .map((absence) => `${absence.absenceTypeName}: ${formatDate(absence.startDate)}${absence.startDate === absence.endDate ? '' : ` a ${formatDate(absence.endDate)}`}`)
        .join(' · ')}
    </Alert>
  );
};
