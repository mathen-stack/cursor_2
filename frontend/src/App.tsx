import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppLayout } from "@/components/AppLayout"
import { AppProvider } from "@/context/AppState"
import { DownloadPage } from "@/pages/DownloadPage"
import { EditorPage } from "@/pages/EditorPage"
import { HomePage } from "@/pages/HomePage"
import { JobPage } from "@/pages/JobPage"
import { ProfilePage } from "@/pages/ProfilePage"

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="job" element={<JobPage />} />
            <Route path="editor" element={<EditorPage />} />
            <Route path="download" element={<DownloadPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
