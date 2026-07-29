import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Deploy from './pages/Deploy'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/deploy" element={<Deploy />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
