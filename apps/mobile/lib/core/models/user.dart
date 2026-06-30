class User {
  final String id;
  final String employeeId;
  final String firstName;
  final String lastName;
  final String email;
  final String? phone;
  final String? department;
  final String? designation;
  final String role;
  final bool isActive;
  final bool requiresPasswordChange;

  const User({
    required this.id,
    required this.employeeId,
    required this.firstName,
    required this.lastName,
    required this.email,
    this.phone,
    this.department,
    this.designation,
    required this.role,
    required this.isActive,
    required this.requiresPasswordChange,
  });

  String get fullName => '$firstName $lastName';
  String get initials => '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'.toUpperCase();

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['_id'] as String? ?? json['id'] as String? ?? '',
      employeeId: json['employeeId'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String? ?? '',
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      department: json['department'] as String?,
      designation: json['designation'] as String?,
      role: json['role'] as String? ?? 'employee',
      isActive: json['isActive'] as bool? ?? true,
      requiresPasswordChange: json['requiresPasswordChange'] as bool? ?? false,
    );
  }
}
