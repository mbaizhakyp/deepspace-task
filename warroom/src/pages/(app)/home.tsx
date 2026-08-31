/** /home → the lobby. Kept because the scaffold's nav and auth flows land here. */

import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/rooms" replace />
}
