import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Deploy from './pages/Deploy'
import Renew from './pages/Renew'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/renew" element={<Renew />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
