import Capacitor

class GroundBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(GroundLiveActivityPlugin())
    }
}
