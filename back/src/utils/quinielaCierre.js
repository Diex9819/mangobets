// 🔒 ¿Un partido concreto acepta pronósticos AHORA? (bloqueo POR PARTIDO, no global)
//   - la jornada no tiene cerrada la recepción manualmente (recepcionAbierta !== false)
//   - el partido no está cerrado manualmente (cerrado !== true)
//   - el partido NO tiene resultadoOficial
//   - no ha empezado: Date.now() <= inicioMs
//   - inicio se lee de `horario` (canónico) o alias `fechaInicio`; fecha inválida ⇒ no cierra
export function partidoAbiertoParaPronosticar(partido, jornada, ahora = Date.now()) {
  if (!jornada || jornada.recepcionAbierta === false) return false;
  if (!partido) return false;
  if (partido.cerrado === true) return false;
  if (partido.resultadoOficial) return false;

  const inicioMs = new Date(partido.horario ?? partido.fechaInicio).getTime();
  if (!Number.isNaN(inicioMs) && ahora > inicioMs) return false;

  return true;
}

export default partidoAbiertoParaPronosticar;
