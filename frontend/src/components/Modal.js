// Dialog basics shared by Modal and ConfirmModal: focus moves into the dialog and Escape closes it.
// (Options API hooks on purpose: Vue 3 ignores setup() declared inside a mixin.)
const dialogFocus = {
  mounted() {
    this._opener = document.activeElement;
    if (this.$refs.el) {
      this.$refs.el.focus();
      this._trap = (e) => {
        if (e.key !== 'Tab') return;
        const nodes = this.$refs.el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      };
      this.$refs.el.addEventListener('keydown', this._trap);
    }
  },
  beforeUnmount() {
    if (this._trap && this.$refs.el) this.$refs.el.removeEventListener('keydown', this._trap);
    if (this._opener && this._opener.focus) this._opener.focus();
  },
};

export const Modal = {
  mixins: [dialogFocus],
  // `wide` must be a declared Boolean: with an untyped prop a bare `wide` attribute arrives as '' (falsy) and the dialog
  // silently stays at the narrow default width.
  props: { title: String, wide: { type: Boolean, default: false }, icon: String },
  emits: ['close'],
  template: `
  <div ref="el" tabindex="-1" role="dialog" aria-modal="true" :aria-label="title" class="modal-backdrop-custom"
       @click.self="$emit('close')" @keydown.esc="$emit('close')">
    <div class="modal-dialog" :class="wide ? 'modal-lg' : ''">
      <div class="modal-content printable">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2">
            <i v-if="icon" :class="'bi ' + icon + ' text-primary'"></i>
            <span>{{ title }}</span>
          </h5>
          <button type="button" class="btn-close ms-auto no-print" aria-label="Close" @click="$emit('close')"></button>
        </div>
        <div class="modal-body"><slot /></div>
      </div>
    </div>
  </div>`,
};

export const FormModal = {
  props: ['title', 'fields', 'initial', 'submit', 'icon'],
  emits: ['close'],
  components: { Modal },
  data() {
    return { f: { ...(this.initial || {}) }, error: '', saving: false };
  },
  methods: {
    async save() {
      this.saving = true;
      this.error = '';
      try {
        await this.submit(this.f);
        this.$emit('close');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.saving = false;
      }
    },
  },
  template: `
  <Modal :title="title" :icon="icon || 'bi-pencil-square'" @close="$emit('close')">
    <form @submit.prevent="save">
      <div v-for="fl in fields" :key="fl.key" class="mb-3">
        <label class="form-label small fw-semibold text-muted mb-1">
          {{ fl.label }}<span v-if="fl.required" class="text-danger"> *</span>
        </label>
        
        <select v-if="fl.type === 'select'" class="form-select" v-model="f[fl.key]" :required="fl.required">
          <option v-if="!fl.required" value="">-- Select --</option>
          <option v-for="o in fl.options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        
        <textarea v-else-if="fl.type === 'textarea'" class="form-control" rows="3" v-model="f[fl.key]" :placeholder="fl.placeholder || ''"></textarea>
        
        <input v-else class="form-control" :type="fl.type || 'text'" v-model="f[fl.key]" :required="fl.required"
               :min="fl.min" :step="fl.step" :minlength="fl.minlength" :maxlength="fl.maxlength" :pattern="fl.pattern"
               :placeholder="fl.placeholder || ''">
      </div>
      
      <div v-if="error" class="alert alert-danger py-2 small d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-octagon-fill"></i>
        <span>{{ error }}</span>
      </div>
      
      <div class="d-flex justify-content-end gap-2 pt-2">
        <button type="button" class="btn btn-light" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="bi bi-check2"></i>
          <span>Save</span>
        </button>
      </div>
    </form>
  </Modal>`,
};

export const ConfirmModal = {
  mixins: [dialogFocus],
  props: ['title', 'message', 'confirmText', 'cancelText', 'danger'],
  emits: ['confirm', 'cancel'],
  template: `
  <div ref="el" tabindex="-1" role="alertdialog" aria-modal="true" :aria-label="title || 'Please confirm'"
       class="modal-backdrop-custom" @click.self="$emit('cancel')" @keydown.esc="$emit('cancel')">
    <div class="modal-dialog modal-sm">
      <div class="modal-content">
        <div class="modal-header py-3">
          <h6 class="modal-title fw-bold d-flex align-items-center gap-2">
            <i :class="danger ? 'bi bi-exclamation-triangle-fill text-danger' : 'bi bi-info-circle-fill text-primary'"></i>
            <span>{{ title || 'Please Confirm' }}</span>
          </h6>
          <button type="button" class="btn-close ms-auto" aria-label="Close" @click="$emit('cancel')"></button>
        </div>
        <div class="modal-body py-3 text-secondary">
          {{ message }}
        </div>
        <div class="modal-footer py-2">
          <button class="btn btn-light btn-sm" @click="$emit('cancel')">{{ cancelText || 'Cancel' }}</button>
          <button class="btn btn-sm" :class="danger ? 'btn-danger' : 'btn-primary'" @click="$emit('confirm')">
            {{ confirmText || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </div>`,
};
