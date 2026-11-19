// Invitation reçue avant la création du compte : on affiche le salon sur l'écran de bienvenue,
// puis on rejoint directement le salon après « C'est parti ».
import { signal } from '@preact/signals'

export const invitePending = signal(null)
