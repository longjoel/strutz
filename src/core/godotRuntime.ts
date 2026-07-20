export const FORCE_EMITTER_GD = `extends Marker3D

@export var widget_id: String = ""
@export_enum("engine", "thruster") var component_kind: String = "thruster"
@export var force_direction: Vector3 = Vector3(0, 0, -1)
@export var max_force_newtons: float = 0.0
@export var enabled: bool = true
`;

export const RAYCAST_WHEEL_GD = `extends Marker3D

@export var widget_id: String = ""
@export var axle_direction: Vector3 = Vector3.RIGHT
@export var radius_meters: float = 0.5
@export var suspension_travel_meters: float = 0.35
@export var steering_limit_degrees: float = 30.0
@export var grip: float = 1.2
@export var steering: bool = true
@export var driven: bool = true
@export var braking: bool = true
@export var enabled: bool = true
@export var visual_node_name: String = ""
var contacting: bool = false
var last_distance: float = 0.0
var _visual: Node3D = null
var _spin_angle := 0.0
var _steer_amount := 0.0

func bind_visual(node: Node3D) -> void:
    _visual = node

func update_visual(forward_speed: float, steer_amount: float, delta: float) -> void:
    _spin_angle += forward_speed / maxf(radius_meters, 0.01) * delta
    _steer_amount = steer_amount
    if _visual != null:
        var steer_rotation := Quaternion(Vector3.UP, -deg_to_rad(steering_limit_degrees) * _steer_amount if steering else 0.0)
        var spin_rotation := Quaternion(axle_direction.normalized(), _spin_angle)
        _visual.quaternion = steer_rotation * spin_rotation
`;

export const REPULSOR_PAD_GD = `extends Marker3D

@export var widget_id: String = ""
@export var push_direction: Vector3 = Vector3.DOWN
@export var range_meters: float = 2.0
@export var target_meters: float = 1.0
@export var max_force_newtons: float = 0.0
@export var damping_ratio: float = 0.9
@export var enabled: bool = true
var contacting: bool = false
var last_distance: float = 0.0
`;

export const VEHICLE_CONTROLLER_GD = `extends RigidBody3D

signal controller_ready(capabilities: Dictionary)
signal capabilities_changed(capabilities: Dictionary)
signal grounded_changed(is_grounded: bool)
signal wheel_contact_changed(widget_id: String, is_contacting: bool, collider: Object)
signal repulsor_contact_changed(widget_id: String, is_contacting: bool, collider: Object, distance: float)
signal body_contact_started(body: Node)
signal body_contact_ended(body: Node)

@export var thruster_angular_acceleration: float = 2.0
@export var wheel_drive_acceleration: float = 6.0
@export var wheel_brake_acceleration: float = 12.0
@export var suspension_damping_ratio: float = 0.8
@export var repulsors_enabled: bool = true

var _command: Dictionary = {}
var _was_grounded := false
var _capabilities: Dictionary = {}

func _ready() -> void:
    contact_monitor = true
    if max_contacts_reported < 16:
        max_contacts_reported = 16
    body_entered.connect(func(body: Node): body_contact_started.emit(body))
    body_exited.connect(func(body: Node): body_contact_ended.emit(body))
    for wheel in _owned_group("strutz_wheel"):
        var visual := find_child(wheel.visual_node_name, true, false) as Node3D
        if visual != null:
            wheel.bind_visual(visual)
    _refresh_capabilities()
    controller_ready.emit(_capabilities.duplicate(true))

func apply_command(value: Dictionary) -> void:
    _command = value.duplicate(true)

func clear_command() -> void:
    _command.clear()

func set_component_enabled(widget_id: String, enabled: bool) -> bool:
    for node in _components():
        if node.get("widget_id") == widget_id:
            node.set("enabled", enabled)
            _refresh_capabilities()
            return true
    return false

func activate_camera() -> bool:
    var camera := get_node_or_null("CameraRig/Camera3D") as Camera3D
    if camera == null:
        return false
    camera.make_current()
    return true

func deactivate_camera() -> void:
    var camera := get_node_or_null("CameraRig/Camera3D") as Camera3D
    if camera != null:
        camera.clear_current()

func get_capabilities() -> Dictionary:
    return _capabilities.duplicate(true)

func get_telemetry() -> Dictionary:
    return {
        "linear_velocity": linear_velocity,
        "angular_velocity": angular_velocity,
        "grounded": _was_grounded,
        "mass_kg": mass,
        "capabilities": get_capabilities(),
    }

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
    var linear_input: Vector3 = _command.get("linear", Vector3.ZERO)
    var angular_input: Vector3 = _command.get("angular", Vector3.ZERO)
    linear_input = Vector3(clampf(linear_input.x, -1.0, 1.0), clampf(linear_input.y, -1.0, 1.0), clampf(linear_input.z, -1.0, 1.0))
    angular_input = Vector3(clampf(angular_input.x, -1.0, 1.0), clampf(angular_input.y, -1.0, 1.0), clampf(angular_input.z, -1.0, 1.0))
    var desired_linear := Vector3(linear_input.x, linear_input.y, -linear_input.z)
    var desired_angular := Vector3(angular_input.x, angular_input.y, -angular_input.z)
    _apply_emitters(state, desired_linear, desired_angular)
    var wheel_grounded := _apply_wheels(state)
    var repulsor_grounded := _apply_repulsors(state)
    var grounded := wheel_grounded or repulsor_grounded
    if grounded != _was_grounded:
        _was_grounded = grounded
        grounded_changed.emit(grounded)

func _apply_emitters(state: PhysicsDirectBodyState3D, desired_linear: Vector3, desired_angular: Vector3) -> void:
    for emitter in _owned_group("strutz_force_emitter"):
        if not emitter.enabled:
            continue
        var direction: Vector3 = emitter.force_direction.normalized()
        var activation := maxf(0.0, desired_linear.dot(direction))
        if emitter.component_kind == "thruster" and desired_angular.length_squared() > 0.0001:
            var torque_axis: Vector3 = emitter.position.cross(direction)
            if torque_axis.length_squared() > 0.0001:
                activation += maxf(0.0, desired_angular.dot(torque_axis.normalized()))
        activation = clampf(activation, 0.0, 1.0)
        if activation <= 0.0:
            continue
        var world_force: Vector3 = state.transform.basis * direction * float(emitter.max_force_newtons) * activation
        var world_offset: Vector3 = state.transform.basis * Vector3(emitter.position)
        state.apply_force(world_force, world_offset)

func _apply_wheels(state: PhysicsDirectBodyState3D) -> bool:
    var wheels := _owned_group("strutz_wheel")
    if wheels.is_empty():
        return false
    var drive := clampf(float(_command.get("drive", 0.0)), -1.0, 1.0)
    var steer := clampf(float(_command.get("steering", 0.0)), -1.0, 1.0)
    var brake := clampf(float(_command.get("brake", 0.0)), 0.0, 1.0)
    var handbrake := clampf(float(_command.get("handbrake", 0.0)), 0.0, 1.0)
    var grounded := false
    for wheel in wheels:
        if not wheel.enabled:
            continue
        var from: Vector3 = state.transform * Vector3(wheel.position)
        var local_down: Vector3 = Vector3.DOWN
        var ray_length: float = wheel.radius_meters + wheel.suspension_travel_meters
        var to: Vector3 = from + state.transform.basis * local_down * ray_length
        var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, collision_mask, [get_rid()])
        var hit: Dictionary = state.get_space_state().intersect_ray(query)
        var contacting: bool = not hit.is_empty()
        if contacting:
            grounded = true
            var distance: float = from.distance_to(hit.position)
            var compression := clampf((ray_length - distance) / maxf(wheel.suspension_travel_meters, 0.01), 0.0, 1.0)
            var spring_force := mass * 9.81 * 2.0 * compression / maxf(float(wheels.size()), 1.0)
            var point_velocity: Vector3 = state.linear_velocity + state.angular_velocity.cross(state.transform.basis * Vector3(wheel.position))
            var up_world: Vector3 = state.transform.basis * Vector3.UP
            var damping: float = point_velocity.dot(up_world) * mass * suspension_damping_ratio / maxf(float(wheels.size()), 1.0)
            state.apply_force(up_world * maxf(0.0, spring_force - damping), state.transform.basis * wheel.position)
            var steer_angle: float = deg_to_rad(float(wheel.steering_limit_degrees)) * steer if wheel.steering else 0.0
            var forward_local: Vector3 = Vector3.FORWARD.rotated(Vector3.UP, -steer_angle)
            var right_local: Vector3 = Vector3.RIGHT.rotated(Vector3.UP, -steer_angle)
            var forward_world: Vector3 = state.transform.basis * forward_local
            var right_world: Vector3 = state.transform.basis * right_local
            var offset: Vector3 = state.transform.basis * Vector3(wheel.position)
            if wheel.driven:
                state.apply_force(forward_world * drive * mass * wheel_drive_acceleration / maxf(float(wheels.size()), 1.0), offset)
            var lateral_speed := point_velocity.dot(right_world)
            wheel.update_visual(point_velocity.dot(forward_world), steer, state.step)
            state.apply_force(-right_world * lateral_speed * mass * wheel.grip / maxf(float(wheels.size()), 1.0), offset)
            if wheel.braking and (brake > 0.0 or handbrake > 0.0):
                var forward_speed := point_velocity.dot(forward_world)
                state.apply_force(-forward_world * signf(forward_speed) * mass * wheel_brake_acceleration * maxf(brake, handbrake) / maxf(float(wheels.size()), 1.0), offset)
            wheel.last_distance = distance
        if contacting != wheel.contacting:
            wheel.contacting = contacting
            wheel_contact_changed.emit(wheel.widget_id, contacting, hit.get("collider") if contacting else null)
    return grounded

func _apply_repulsors(state: PhysicsDirectBodyState3D) -> bool:
    if not repulsors_enabled or not bool(_command.get("repulsors_enabled", true)):
        return false
    var grounded := false
    for pad in _owned_group("strutz_repulsor"):
        if not pad.enabled:
            continue
        var from: Vector3 = state.transform * Vector3(pad.position)
        var world_direction: Vector3 = state.transform.basis * Vector3(pad.push_direction).normalized()
        var to: Vector3 = from + world_direction * float(pad.range_meters)
        var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, collision_mask, [get_rid()])
        var hit: Dictionary = state.get_space_state().intersect_ray(query)
        var contacting: bool = not hit.is_empty()
        var distance: float = float(pad.range_meters)
        if contacting:
            grounded = true
            distance = from.distance_to(hit.position)
            var error := clampf((pad.target_meters - distance) / maxf(pad.target_meters, 0.01), -1.0, 1.0)
            var point_velocity: Vector3 = state.linear_velocity + state.angular_velocity.cross(state.transform.basis * Vector3(pad.position))
            var damping: float = point_velocity.dot(-world_direction) * mass * float(pad.damping_ratio)
            var force: float = clampf(float(pad.max_force_newtons) * maxf(0.0, 0.5 + error) - damping, 0.0, float(pad.max_force_newtons))
            state.apply_force(-world_direction * force, state.transform.basis * pad.position)
            pad.last_distance = distance
        if contacting != pad.contacting:
            pad.contacting = contacting
            repulsor_contact_changed.emit(pad.widget_id, contacting, hit.get("collider") if contacting else null, distance)
    return grounded

func _components() -> Array[Node]:
    var result: Array[Node] = []
    for group in ["strutz_force_emitter", "strutz_wheel", "strutz_repulsor"]:
        result.append_array(_owned_group(group))
    return result

func _owned_group(group_name: StringName) -> Array[Node]:
    return get_tree().get_nodes_in_group(group_name).filter(func(node: Node): return is_ancestor_of(node))

func _refresh_capabilities() -> void:
    var next := {
        "main_propulsion": _owned_group("strutz_force_emitter").any(func(node: Node): return node.component_kind == "engine" and node.enabled),
        "maneuvering": _owned_group("strutz_force_emitter").any(func(node: Node): return node.component_kind == "thruster" and node.enabled),
        "wheels": _owned_group("strutz_wheel").any(func(node: Node): return node.enabled),
        "repulsors": _owned_group("strutz_repulsor").any(func(node: Node): return node.enabled),
        "camera": has_node("CameraRig/Camera3D"),
    }
    if next != _capabilities:
        _capabilities = next
        capabilities_changed.emit(_capabilities.duplicate(true))
`;
