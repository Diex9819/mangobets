import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuinielaService } from '../../services/quiniela.service';
import {
  Jornada,
  MarcadorGoles,
  PartidoQuiniela,
} from '../../models/quiniela.model';

/**
 * 👑 PANEL DE ADMINISTRACIÓN DE QUINIELAS
 *
 * Tiene dos modos, según los inputs que reciba:
 *  - Con `partido` → editor para publicar el resultado oficial de ese partido.
 *  - Sin `partido` → panel para listar, crear, editar y eliminar jornadas y partidos.
 */
@Component({
  selector: 'app-quiniela-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quiniela-admin.component.html',
  styleUrl: './quiniela-admin.component.css',
})
export class QuinielaAdminComponent implements OnInit, OnChanges {

  // ── Modo 1: publicar resultado de un partido ──
  @Input() jornada: Jornada | null = null;
  @Input() partido: PartidoQuiniela | null = null;
  @Output() publicado = new EventEmitter<void>();

  // ── Modo 2: gestión de jornadas ──
  @Output() jornadaCreada = new EventEmitter<Jornada>();

  // 🔄 Se incrementa desde el padre para refrescar la lista cuando cambia la jornada
  @Input() refreshKey = 0;

  // ── Estado del editor de resultado ──
  resultadoElegido: MarcadorGoles | null = null;
  mostrarEditor = false;
  publicando = false;
  error = '';

  // ── Estado del panel de jornadas ──
  jornadas: Jornada[] = [];
  cargandoJornadas = false;
  activandoId = '';

  // ⚽ Jornada desplegada para ver/editar sus partidos
  expandidaId = '';

  // ── Edición del nombre de una jornada ──
  editandoNombreId = '';
  nombreJornadaForm = '';
  guardandoNombre = false;

  // ── Edición de un partido ──
  editandoPartido: { jornadaId: string; partido: PartidoQuiniela } | null = null;
  partidoForm = { local: '', visitante: '', horario: '' };
  guardandoEdicion = false;
  errorEdicion = '';

  // ── Confirmación de borrado ──
  borrando: {
    tipo: 'jornada' | 'partido';
    jornadaId: string;
    partidoId?: string;
    nombre: string;
  } | null = null;
  eliminando = false;

  // ── Formulario de nueva jornada ──
  nuevaJornada = {
    nombre: '',
    activa: true,
    partidos: [this.partidoVacio()]
  };
  creating = false;
  createError = '';

  // ── Formulario: agregar partido a una jornada existente ──
  agregarPartidoAbiertoId = '';
  formAgregarPartido = { local: '', visitante: '', horario: '' };
  guardandoAgregarPartido = false;
  errorAgregarPartido = '';

  constructor(private quinielaService: QuinielaService) {}

  ngOnInit() {
    // Solo el panel de jornadas carga el listado
    if (!this.partido) {
      this.cargarJornadas();
    } else if (this.partido.resultadoOficial) {
      // Si ya hay resultado publicado, se abre el editor con ese marcador
      this.resultadoElegido = {
        golesLocal: this.partido.resultadoOficial.golesLocal,
        golesVisita: this.partido.resultadoOficial.golesVisita
      };
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // El padre avisa que la jornada cambió → se refresca la lista
    if (
      changes['refreshKey'] &&
      !changes['refreshKey'].firstChange &&
      !this.modoResultado
    ) {
      this.cargarJornadas();
    }
  }

  // 🔀 ¿Estamos en el modo "publicar resultado"?
  get modoResultado(): boolean {
    return !!this.partido;
  }

  // ═══════════════
  // 🏁 PUBLICAR RESULTADO
  // ═══════════════

  alternarEditor() {
    this.mostrarEditor = !this.mostrarEditor;
    this.error = '';

    if (this.mostrarEditor && this.partido?.resultadoOficial) {
      this.resultadoElegido = {
        golesLocal: this.partido.resultadoOficial.golesLocal,
        golesVisita: this.partido.resultadoOficial.golesVisita
      };
    }
  }

  // ✏️ Actualiza un lado del marcador del resultado (admin)
  setResultadoGoles(lado: 'L' | 'V', valor: number) {
    if (!this.resultadoElegido) {
      this.resultadoElegido = { golesLocal: 0, golesVisita: 0 };
    }

    if (lado === 'L') {
      this.resultadoElegido.golesLocal = valor;
    } else {
      this.resultadoElegido.golesVisita = valor;
    }
  }

  publicar() {
    if (!this.jornada || !this.partido || this.publicando) return;
    if (!this.resultadoElegido) {
      this.error = 'Completá el marcador del resultado';
      return;
    }

    this.publicando = true;
    this.error = '';

    this.quinielaService
      .publicarResultado(this.jornada.id, this.partido.id, this.resultadoElegido)
      .subscribe({
        next: () => {
          this.publicando = false;
          this.mostrarEditor = false;
          this.publicado.emit();
        },
        error: (err) => {
          this.publicando = false;
          this.error = err.error?.error || 'Error al publicar el resultado';
        }
      });
  }

  // ═══════════════
  // 📋 GESTIÓN DE JORNADAS
  // ═══════════════

  cargarJornadas() {
    this.cargandoJornadas = true;

    this.quinielaService.listarJornadas().subscribe({
      next: (jornadas) => {
        this.jornadas = jornadas;
        this.cargandoJornadas = false;
      },
      error: () => {
        this.cargandoJornadas = false;
      }
    });
  }

  activar(jornadaId: string) {
    if (this.activandoId) return;

    this.activandoId = jornadaId;
    this.createError = '';

    this.quinielaService.activarJornada(jornadaId).subscribe({
      next: () => {
        this.activandoId = '';
        this.cargarJornadas();
        this.publicado.emit();
      },
      error: (err) => {
        this.activandoId = '';
        this.createError = err.error?.error || 'Error al activar la jornada';
      }
    });
  }

  // ── Editar el nombre de la jornada ──

  iniciarEdicionNombre(jornada: Jornada) {
    this.editandoNombreId = jornada.id;
    this.nombreJornadaForm = jornada.nombre;
  }

  cancelarEdicionNombre() {
    this.editandoNombreId = '';
    this.nombreJornadaForm = '';
  }

  guardarEdicionNombre(jornada: Jornada) {
    const nombre = this.nombreJornadaForm.trim();

    if (!nombre || this.guardandoNombre) return;

    this.guardandoNombre = true;
    this.createError = '';

    this.quinielaService.editarJornada(jornada.id, nombre).subscribe({
      next: () => {
        this.guardandoNombre = false;
        this.cancelarEdicionNombre();
        this.cargarJornadas();
        this.publicado.emit();
      },
      error: (err) => {
        this.guardandoNombre = false;
        this.createError = err.error?.error || 'Error al editar la jornada';
      }
    });
  }

  // ═══════════════
  // ⚽ PARTIDOS DE UNA JORNADA
  // ═══════════════

  alternarPartidos(jornadaId: string) {
    this.expandidaId = this.expandidaId === jornadaId ? '' : jornadaId;
  }

  editarPartido(jornadaId: string, partido: PartidoQuiniela) {
    this.editandoPartido = { jornadaId, partido };
    this.partidoForm = {
      local: partido.local,
      visitante: partido.visitante,
      horario: this.aDatetimeLocal(partido.horario)
    };
    this.errorEdicion = '';
  }

  cancelarEdicion() {
    this.editandoPartido = null;
    this.errorEdicion = '';
  }

  guardarEdicion() {
    if (!this.editandoPartido || this.guardandoEdicion) return;

    this.guardandoEdicion = true;
    this.errorEdicion = '';

    this.quinielaService
      .editarPartido(this.editandoPartido.jornadaId, this.editandoPartido.partido.id, {
        local: this.partidoForm.local.trim(),
        visitante: this.partidoForm.visitante.trim(),
        horario: this.partidoForm.horario
      })
      .subscribe({
        next: () => {
          this.guardandoEdicion = false;
          this.cancelarEdicion();
          this.cargarJornadas();
          this.publicado.emit();
        },
        error: (err) => {
          this.guardandoEdicion = false;
          this.errorEdicion = err.error?.error || 'Error al editar el partido';
        }
      });
  }

  // ➕ Agregar un partido a una jornada existente
  abrirAgregarPartido(jornadaId: string) {
    this.agregarPartidoAbiertoId = jornadaId;
    this.expandidaId = jornadaId;
    this.formAgregarPartido = { local: '', visitante: '', horario: '' };
    this.errorAgregarPartido = '';
  }

  cancelarAgregarPartido() {
    this.agregarPartidoAbiertoId = '';
    this.formAgregarPartido = { local: '', visitante: '', horario: '' };
    this.errorAgregarPartido = '';
  }

  guardarPartido(jornadaId: string) {
    const { local, visitante, horario } = this.formAgregarPartido;

    if (!local.trim() || !visitante.trim() || !horario) {
      this.errorAgregarPartido = 'Completá local, visitante y fecha/hora';
      return;
    }

    if (this.guardandoAgregarPartido) return;

    this.guardandoAgregarPartido = true;
    this.errorAgregarPartido = '';

    this.quinielaService
      .agregarPartido(jornadaId, {
        local: local.trim(),
        visitante: visitante.trim(),
        horario
      })
      .subscribe({
        next: () => {
          this.guardandoAgregarPartido = false;
          this.cancelarAgregarPartido();
          this.cargarJornadas();
          this.publicado.emit();
        },
        error: (err) => {
          this.guardandoAgregarPartido = false;
          this.errorAgregarPartido = err.error?.error || 'Error al agregar el partido';
        }
      });
  }

  // ═══════════════
  // 🗑️ ELIMINAR (con confirmación)
  // ═══════════════

  pedirBorrado(tipo: 'jornada' | 'partido', jornada: Jornada, partido?: PartidoQuiniela) {
    this.borrando = {
      tipo,
      jornadaId: jornada.id,
      partidoId: partido?.id,
      nombre: partido ? `${partido.local} vs ${partido.visitante}` : jornada.nombre
    };
  }

  cancelarBorrado() {
    this.borrando = null;
  }

  confirmarBorrado() {
    if (!this.borrando || this.eliminando) return;

    this.eliminando = true;
    const { tipo, jornadaId, partidoId } = this.borrando;

    const peticion =
      tipo === 'jornada'
        ? this.quinielaService.eliminarJornada(jornadaId)
        : this.quinielaService.eliminarPartido(jornadaId, partidoId!);

    peticion.subscribe({
      next: () => {
        this.eliminando = false;
        this.borrando = null;
        this.cancelarEdicion();
        this.cargarJornadas();
        this.publicado.emit();
      },
      error: (err) => {
        this.eliminando = false;
        this.createError = err.error?.error || 'Error al eliminar';
      }
    });
  }

  // ── Formulario de nueva jornada ──

  agregarPartido() {
    this.nuevaJornada.partidos.push(this.partidoVacio());
  }

  quitarPartido(index: number) {
    if (this.nuevaJornada.partidos.length === 1) return;
    this.nuevaJornada.partidos.splice(index, 1);
  }

  crearJornada() {
    if (this.creating) return;

    const nombre = this.nuevaJornada.nombre.trim();

    if (!nombre) {
      this.createError = 'Escribe el nombre de la jornada';
      return;
    }

    const partidos = this.nuevaJornada.partidos
      .filter((p) => p.local.trim() && p.visitante.trim() && p.horario)
      .map((p) => ({
        local: p.local.trim(),
        visitante: p.visitante.trim(),
        horario: p.horario
      }));

    if (partidos.length === 0) {
      this.createError = 'Agregá al menos un partido con local, visitante y horario';
      return;
    }

    this.creating = true;
    this.createError = '';

    this.quinielaService
      .crearJornada({ nombre, activa: this.nuevaJornada.activa, partidos })
      .subscribe({
        next: (jornada) => {
          this.creating = false;
          this.nuevaJornada = {
            nombre: '',
            activa: true,
            partidos: [this.partidoVacio()]
          };
          this.cargarJornadas();
          this.jornadaCreada.emit(jornada);
        },
        error: (err) => {
          this.creating = false;
          this.createError = err.error?.error || 'Error al crear la jornada';
        }
      });
  }

  // ═══════════════
  // 🔧 UTILIDADES
  // ═══════════════

  // 📅 ISO → valor de <input type="datetime-local"> (hora local)
  private aDatetimeLocal(iso: string): string {
    const fecha = new Date(iso);

    if (Number.isNaN(fecha.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');

    return (
      `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
      `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
    );
  }

  private partidoVacio() {
    return { local: '', visitante: '', horario: '' };
  }
}
