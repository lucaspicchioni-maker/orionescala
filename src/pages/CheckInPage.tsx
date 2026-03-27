import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MapPin,
  LogIn,
  LogOut,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Navigation,
  Shield,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { PontoRecord, GeoLocation } from '@/types'

// ── Geo helpers ──────────────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo navegador'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '--:--'
  const d = new Date(isoDate)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getScheduledShift(
  schedules: ReturnType<typeof useApp>['state']['schedules'],
  date: string,
  employeeId: string,
): { start: string; end: string; hours: number } | null {
  for (const schedule of schedules) {
    for (const day of schedule.days) {
      if (day.date !== date) continue
      const assignedSlots: number[] = []
      day.slots.forEach((slot, idx) => {
        if (slot.assignments.some((a) => a.employeeId === employeeId)) {
          assignedSlots.push(idx)
        }
      })
      if (assignedSlots.length === 0) continue
      const startHour = day.slots[Math.min(...assignedSlots)].hour.split('-')[0]
      const endSlot = day.slots[Math.max(...assignedSlots)]
      const endHour = endSlot.hour.split('-')[1]
      return { start: startHour, end: endHour, hours: assignedSlots.length }
    }
  }
  return null
}

function calculateLateMinutes(scheduledStart: string, checkInTime: string): number {
  const [sh, sm] = scheduledStart.split(':').map(Number)
  const checkIn = new Date(checkInTime)
  const scheduledMinutes = sh * 60 + (sm || 0)
  const actualMinutes = checkIn.getHours() * 60 + checkIn.getMinutes()
  return Math.max(0, actualMinutes - scheduledMinutes)
}

function calculateEarlyLeave(scheduledEnd: string, checkOutTime: string): number {
  const [eh, em] = scheduledEnd.split(':').map(Number)
  const checkOut = new Date(checkOutTime)
  const scheduledMinutes = eh * 60 + (em || 0)
  const actualMinutes = checkOut.getHours() * 60 + checkOut.getMinutes()
  return Math.max(0, scheduledMinutes - actualMinutes)
}

// ── Component ────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { state, dispatch } = useApp()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'too_far'>('idle')
  const [geoError, setGeoError] = useState<string>('')
  const [currentLocation, setCurrentLocation] = useState<GeoLocation | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const today = getToday()
  const locationConfig = state.locationConfig
  const locationConfigured = locationConfig.lat !== 0 && locationConfig.lng !== 0

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.status === 'ativo' && e.role !== 'gerente'),
    [state.employees],
  )

  const selectedEmployee = useMemo(
    () => state.employees.find((e) => e.id === selectedEmployeeId),
    [state.employees, selectedEmployeeId],
  )

  const shift = useMemo(
    () => selectedEmployeeId ? getScheduledShift(state.schedules, today, selectedEmployeeId) : null,
    [state.schedules, today, selectedEmployeeId],
  )

  const existingRecord = useMemo(
    () => state.pontoRecords.find((p) => p.employeeId === selectedEmployeeId && p.date === today),
    [state.pontoRecords, selectedEmployeeId, today],
  )

  const hasCheckedIn = !!existingRecord?.checkIn
  const hasCheckedOut = !!existingRecord?.checkOut

  // Current time display
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getLocation = useCallback(async (): Promise<GeoLocation | null> => {
    setGeoStatus('loading')
    setGeoError('')
    try {
      const position = await getCurrentPosition()
      const geo: GeoLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
      }
      setCurrentLocation(geo)

      if (locationConfigured) {
        const dist = haversineDistance(geo.lat, geo.lng, locationConfig.lat, locationConfig.lng)
        setDistance(dist)

        if (dist > locationConfig.radiusMeters) {
          setGeoStatus('too_far')
          setGeoError(`Voce esta a ${Math.round(dist)}m da cozinha (maximo: ${locationConfig.radiusMeters}m)`)
          return null
        }
      }

      setGeoStatus('success')
      return geo
    } catch (err) {
      const error = err as GeolocationPositionError
      let message = 'Erro ao obter localizacao'
      if (error.code === 1) message = 'Permissao de localizacao negada. Ative o GPS e permita o acesso.'
      else if (error.code === 2) message = 'Localizacao indisponivel. Verifique o GPS.'
      else if (error.code === 3) message = 'Tempo esgotado. Tente novamente.'
      setGeoStatus('error')
      setGeoError(message)
      return null
    }
  }, [locationConfig, locationConfigured])

  const handleCheckIn = useCallback(async () => {
    const geo = await getLocation()
    if (!geo && locationConfigured) return // location required but failed

    const now = new Date()
    const lateMinutes = shift ? calculateLateMinutes(shift.start, now.toISOString()) : 0
    const dist = locationConfigured
      ? haversineDistance(geo!.lat, geo!.lng, locationConfig.lat, locationConfig.lng)
      : null

    if (existingRecord) {
      dispatch({
        type: 'UPDATE_PONTO',
        payload: {
          ...existingRecord,
          checkIn: now.toISOString(),
          checkInLocation: geo,
          checkInDistance: dist !== null ? Math.round(dist) : null,
          lateMinutes,
          status: lateMinutes > 10 ? 'late' : 'on_time',
        },
      })
    } else {
      const record: PontoRecord = {
        id: crypto.randomUUID(),
        employeeId: selectedEmployeeId,
        date: today,
        scheduledStart: shift?.start ?? null,
        scheduledEnd: shift?.end ?? null,
        checkIn: now.toISOString(),
        checkOut: null,
        checkInLocation: geo,
        checkOutLocation: null,
        checkInDistance: dist !== null ? Math.round(dist) : null,
        checkOutDistance: null,
        lateMinutes,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
        status: lateMinutes > 10 ? 'late' : 'on_time',
        notes: '',
      }
      dispatch({ type: 'ADD_PONTO', payload: record })
    }
  }, [getLocation, locationConfigured, locationConfig, shift, existingRecord, selectedEmployeeId, today, dispatch])

  const handleCheckOut = useCallback(async () => {
    if (!existingRecord?.checkIn) return
    const geo = await getLocation()
    if (!geo && locationConfigured) return

    const now = new Date()
    const checkInTime = new Date(existingRecord.checkIn)
    const workedMinutes = Math.round((now.getTime() - checkInTime.getTime()) / 60000)
    const earlyLeaveMinutes = existingRecord.scheduledEnd
      ? calculateEarlyLeave(existingRecord.scheduledEnd, now.toISOString())
      : 0
    const dist = locationConfigured && geo
      ? haversineDistance(geo.lat, geo.lng, locationConfig.lat, locationConfig.lng)
      : null

    dispatch({
      type: 'UPDATE_PONTO',
      payload: {
        ...existingRecord,
        checkOut: now.toISOString(),
        checkOutLocation: geo,
        checkOutDistance: dist !== null ? Math.round(dist) : null,
        workedMinutes,
        earlyLeaveMinutes,
        status: earlyLeaveMinutes > 15 ? 'partial' : existingRecord.status,
      },
    })
  }, [getLocation, locationConfigured, locationConfig, existingRecord, dispatch])

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in mx-auto max-w-lg space-y-6 p-4">
      {/* Clock */}
      <div className="text-center">
        <div className="text-6xl font-bold tabular-nums text-foreground">
          {String(currentTime.getHours()).padStart(2, '0')}
          <span className="animate-pulse">:</span>
          {String(currentTime.getMinutes()).padStart(2, '0')}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Employee select */}
      <Card variant="glass">
        <label className="mb-2 block text-sm font-medium text-muted-foreground">
          Quem esta registrando?
        </label>
        <select
          value={selectedEmployeeId}
          onChange={(e) => {
            setSelectedEmployeeId(e.target.value)
            setGeoStatus('idle')
            setGeoError('')
          }}
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-lg font-medium text-foreground"
        >
          <option value="">Selecione seu nome...</option>
          {activeEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nickname || emp.name}
            </option>
          ))}
        </select>
      </Card>

      {selectedEmployee && (
        <>
          {/* Shift info */}
          <Card variant="glass">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Turno de hoje</p>
                {shift ? (
                  <p className="text-2xl font-bold text-foreground">
                    {shift.start} — {shift.end}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({shift.hours}h)
                    </span>
                  </p>
                ) : (
                  <p className="text-lg text-muted-foreground">Sem escala hoje</p>
                )}
              </div>
              {existingRecord && (
                <Badge
                  variant={
                    existingRecord.status === 'on_time' ? 'success' :
                    existingRecord.status === 'late' ? 'warning' :
                    existingRecord.status === 'absent' ? 'destructive' : 'muted'
                  }
                  size="md"
                >
                  {existingRecord.status === 'on_time' ? 'No horario' :
                   existingRecord.status === 'late' ? 'Atrasado' :
                   existingRecord.status === 'absent' ? 'Ausente' :
                   existingRecord.status === 'partial' ? 'Parcial' : 'Pendente'}
                </Badge>
              )}
            </div>
          </Card>

          {/* Check-in/out times if existing */}
          {existingRecord && (
            <Card>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Check-in</p>
                  <p className="text-2xl font-bold text-success">{formatTime(existingRecord.checkIn)}</p>
                  {existingRecord.lateMinutes > 0 && (
                    <p className="text-xs text-warning">+{existingRecord.lateMinutes}min atraso</p>
                  )}
                  {existingRecord.checkInDistance !== null && (
                    <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {existingRecord.checkInDistance}m da cozinha
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Check-out</p>
                  <p className={cn('text-2xl font-bold', hasCheckedOut ? 'text-foreground' : 'text-muted-foreground/30')}>
                    {formatTime(existingRecord.checkOut)}
                  </p>
                  {existingRecord.earlyLeaveMinutes > 0 && (
                    <p className="text-xs text-warning">-{existingRecord.earlyLeaveMinutes}min</p>
                  )}
                  {existingRecord.workedMinutes > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.floor(existingRecord.workedMinutes / 60)}h{existingRecord.workedMinutes % 60}m trabalhado
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Location status */}
          {!locationConfigured && (
            <Card variant="glass">
              <div className="flex items-center gap-3 text-sm">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Localizacao nao configurada</p>
                  <p className="text-muted-foreground">
                    Configure as coordenadas da cozinha em Configuracoes para validar a presenca por GPS.
                    Check-in funcionara sem validacao de local.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {geoStatus === 'error' && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              {geoError}
            </div>
          )}

          {geoStatus === 'too_far' && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
              <Navigation className="h-5 w-5 shrink-0" />
              {geoError}
            </div>
          )}

          {geoStatus === 'success' && currentLocation && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle className="h-5 w-5 shrink-0" />
              Localizacao confirmada
              {distance !== null && ` (${Math.round(distance)}m da cozinha)`}
            </div>
          )}

          {/* Action buttons */}
          {!hasCheckedOut && (
            <div className="space-y-3">
              {!hasCheckedIn ? (
                <button
                  onClick={handleCheckIn}
                  disabled={geoStatus === 'loading'}
                  className={cn(
                    'flex w-full items-center justify-center gap-3 rounded-xl py-5 text-xl font-bold transition-all',
                    geoStatus === 'loading'
                      ? 'bg-muted text-muted-foreground cursor-wait'
                      : 'bg-success text-white hover:bg-success/90 active:scale-[0.98]',
                  )}
                >
                  {geoStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      Obtendo localizacao...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-6 w-6" />
                      CHECK-IN
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCheckOut}
                  disabled={geoStatus === 'loading'}
                  className={cn(
                    'flex w-full items-center justify-center gap-3 rounded-xl py-5 text-xl font-bold transition-all',
                    geoStatus === 'loading'
                      ? 'bg-muted text-muted-foreground cursor-wait'
                      : 'bg-accent text-white hover:bg-accent/90 active:scale-[0.98]',
                  )}
                >
                  {geoStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      Obtendo localizacao...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-6 w-6" />
                      CHECK-OUT
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {hasCheckedOut && (
            <div className="rounded-xl bg-success/10 py-6 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-success" />
              <p className="mt-3 text-lg font-bold text-success">Turno finalizado!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Trabalhado: {Math.floor(existingRecord!.workedMinutes / 60)}h{existingRecord!.workedMinutes % 60}m
              </p>
            </div>
          )}
        </>
      )}

      {/* Security note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0" />
        <p>
          {locationConfigured
            ? `Check-in validado por GPS dentro de ${locationConfig.radiusMeters}m da ${locationConfig.name}.`
            : 'Configure a localizacao da cozinha para validacao por GPS.'}
          {' '}Horario registrado com precisao de segundos.
        </p>
      </div>
    </div>
  )
}
