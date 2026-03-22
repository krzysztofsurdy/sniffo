<?php
namespace App\Service;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Enum\UserStatus;
class UserService implements UserServiceInterface {
    public function __construct(
        private readonly UserRepository $userRepository,
    ) {}
    public function createUser(string $name, string $email): User {
        return new User($name, $email);
    }
    public function deactivateUser(User $user): void {
        $user->setStatus(UserStatus::Inactive);
    }
}
